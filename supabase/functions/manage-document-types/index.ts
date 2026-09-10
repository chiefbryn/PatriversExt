import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Missing authorization", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claimsData?.claims?.sub) return err("Unauthorized", 401);
    const user = { id: claimsData.claims.sub as string };

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return err("Admin access required", 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── LIST ──
    if (req.method === "GET" || action === "list") {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .order("category")
        .order("name");
      if (error) return err(error.message, 500);
      return json(data);
    }

    const body = await req.json();

    // ── CREATE ──
    if (action === "create") {
      const { code, name, category, prefix, affects_stock, affects_accounting, description } = body;

      if (!code?.trim()) return err("Code is required");
      if (!name?.trim()) return err("Name is required");
      if (!category?.trim()) return err("Category is required");
      if (!prefix?.trim()) return err("Prefix is required");

      const validStockEffects = ["add", "deduct", "set", "none"];
      if (affects_stock && !validStockEffects.includes(affects_stock)) {
        return err(`affects_stock must be one of: ${validStockEffects.join(", ")}`);
      }

      // Check prefix uniqueness
      const { data: existing } = await supabase
        .from("document_types")
        .select("id")
        .eq("prefix", prefix.trim())
        .maybeSingle();
      if (existing) return err("Prefix already exists. Choose a unique prefix.");

      // Check code uniqueness
      const { data: existingCode } = await supabase
        .from("document_types")
        .select("id")
        .eq("code", code.trim())
        .maybeSingle();
      if (existingCode) return err("Code already exists.");

      const serviceClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data, error } = await serviceClient
        .from("document_types")
        .insert({
          code: code.trim(),
          name: name.trim(),
          category: category.trim(),
          prefix: prefix.trim(),
          affects_stock: affects_stock || "none",
          affects_accounting: affects_accounting ?? false,
          description: description?.trim() || null,
        })
        .select()
        .single();

      if (error) return err(error.message, 500);
      return json(data, 201);
    }

    // ── UPDATE ──
    if (action === "update") {
      const { id, ...updates } = body;
      if (!id) return err("ID is required");

      // Validate prefix uniqueness if changing
      if (updates.prefix) {
        const { data: existing } = await supabase
          .from("document_types")
          .select("id")
          .eq("prefix", updates.prefix.trim())
          .neq("id", id)
          .maybeSingle();
        if (existing) return err("Prefix already in use by another document type.");
      }

      if (updates.affects_stock) {
        const valid = ["add", "deduct", "set", "none"];
        if (!valid.includes(updates.affects_stock)) {
          return err(`affects_stock must be one of: ${valid.join(", ")}`);
        }
      }

      // next_number can only go up
      if (updates.next_number !== undefined) {
        const { data: current } = await supabase
          .from("document_types")
          .select("next_number")
          .eq("id", id)
          .single();
        if (current && updates.next_number < current.next_number) {
          return err(`next_number cannot be decreased (current: ${current.next_number})`);
        }
      }

      const serviceClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const allowedFields = ["code", "name", "category", "prefix", "affects_stock", "affects_accounting", "is_active", "description", "next_number"];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          cleanUpdates[field] = typeof updates[field] === "string" ? updates[field].trim() : updates[field];
        }
      }

      const { data, error } = await serviceClient
        .from("document_types")
        .update(cleanUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) return err(error.message, 500);
      return json(data);
    }

    // ── TOGGLE ACTIVE ──
    if (action === "toggle") {
      const { id } = body;
      if (!id) return err("ID is required");

      const { data: current } = await supabase
        .from("document_types")
        .select("is_active")
        .eq("id", id)
        .single();
      if (!current) return err("Document type not found", 404);

      const serviceClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data, error } = await serviceClient
        .from("document_types")
        .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) return err(error.message, 500);
      return json(data);
    }

    // ── GET NEXT NUMBER (preview, doesn't increment) ──
    if (action === "preview_number") {
      const { code: typeCode } = body;
      if (!typeCode) return err("Code is required");

      const { data: docType } = await supabase
        .from("document_types")
        .select("prefix, next_number")
        .eq("code", typeCode)
        .single();
      if (!docType) return err("Document type not found", 404);

      const preview = `${docType.prefix}-${String(docType.next_number).padStart(5, "0")}`;
      return json({ preview, next_number: docType.next_number });
    }

    return err("Invalid action. Use: list, create, update, toggle, preview_number");
  } catch (e) {
    return err(e.message || "Internal server error", 500);
  }
});
