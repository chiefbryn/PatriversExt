import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Require authenticated caller
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace(/^[Bb]earer\s+/, "");
    const { data: claims, error: authErr } = await supabaseAuth.auth.getClaims(token);
    const callerId = claims?.claims?.sub as string | undefined;
    if (authErr || !callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Require caller to be an admin or CEO
    const { data: callerRoleRow, error: roleCheckErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    const callerRole = callerRoleRow?.role;
    if (roleCheckErr || (callerRole !== "admin" && callerRole !== "ceo")) {
      return new Response(JSON.stringify({ error: "Forbidden: admin or CEO role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action = "create" } = body;

    if (callerRole === "ceo" && action !== "create") {
      return new Response(JSON.stringify({ error: "CEOs can create users but cannot manage existing accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (["set_status", "delete", "reset_password"].includes(action)) {
      const targetUserId = body.user_id;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const [{ data: targetProfile }, { data: targetRole }] = await Promise.all([
        supabaseAdmin.from("profiles").select("username").eq("user_id", targetUserId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", targetUserId).maybeSingle(),
      ]);
      const isProtectedAdmin = targetProfile?.username?.toLowerCase() === "admin" && targetRole?.role === "admin";
      const isProtectedAdminSelfReset = action === "reset_password" && targetUserId === callerId;
      if (isProtectedAdmin && !isProtectedAdminSelfReset) {
        return new Response(JSON.stringify({ error: "The System Admin account is protected" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ACTION: SET STATUS (active | suspended) — bans/unbans at the auth layer too
    if (action === "set_status") {
      const { user_id, status } = body;
      if (!user_id || (status !== "active" && status !== "suspended")) {
        return new Response(JSON.stringify({ error: "user_id and status (active|suspended) are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Update profile flag
      await supabaseAdmin.from("profiles").update({ status }).eq("user_id", user_id);
      // Ban / unban at the auth layer to revoke existing sessions
      const banDuration = status === "suspended" ? "876000h" : "none"; // ~100 years vs none
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: banDuration as any,
      } as any);
      if (banErr) {
        return new Response(JSON.stringify({ error: banErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ACTION: DELETE USER
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Clean up all user data from public tables first
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("login_log").delete().eq("user_id", user_id);
      await supabaseAdmin.from("activity_log").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      
      // Delete auth user - must use shouldSoftDelete to avoid FK issues
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id, true);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: RESET PASSWORD
    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "user_id and new_password are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof new_password !== "string" || new_password.length < 10 || new_password.length > 128) {
        return new Response(JSON.stringify({ error: "Password must be between 10 and 128 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Set must_change_password flag
      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: CREATE USER (default)
    const { email, password, full_name, role, username, outlet_id } = body;

    if (typeof password === "string" && (password.length < 10 || password.length > 128)) {
      return new Response(JSON.stringify({ error: "Password must be between 10 and 128 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof username === "string" && !/^[a-z0-9._-]{3,32}$/i.test(username)) {
      return new Response(JSON.stringify({ error: "Username must be 3-32 letters, numbers, dots, dashes or underscores" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || !full_name || !role || !username) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: password, full_name, role, username" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validRoles = ["admin", "ceo", "pharmacist", "cashier"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (callerRole === "ceo" && role === "admin") {
      return new Response(
        JSON.stringify({ error: "CEOs cannot create System Admin accounts" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outletRequired = role === "cashier" || role === "pharmacist";
    if (outletRequired && !outlet_id) {
      return new Response(
        JSON.stringify({ error: "A branch is required for cashier and pharmacist accounts" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (outlet_id) {
      const { data: outlet } = await supabaseAdmin
        .from("outlets")
        .select("id")
        .eq("id", outlet_id)
        .eq("is_active", true)
        .maybeSingle();
      if (!outlet) {
        return new Response(
          JSON.stringify({ error: "Select an active branch for this user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Auto-generate email from username if not provided
    const userEmail = email || `${username.toLowerCase().replace(/\s+/g, '')}@patrivers.local`;

    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, username },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Ensure the profile exists (username sign-in resolves the email from it)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          full_name,
          email: userEmail,
          username: username.toLowerCase().replace(/\s+/g, ''),
          status: "active",
          must_change_password: true,
          outlet_id: outlet_id || null,
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      return new Response(
        JSON.stringify({ error: `User created but profile setup failed: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (roleError) {
      return new Response(
        JSON.stringify({ error: `User created but role assignment failed: ${roleError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email: userEmail, role }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
