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

/** Calculate line amount */
function calcLineAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/** Calculate document totals */
function calcTotals(items: Array<{ quantity: number; unit_price: number }>, tax: number, discount: number) {
  const subtotal = items.reduce((sum, item) => sum + calcLineAmount(item.quantity, item.unit_price), 0);
  const total = Math.round((subtotal + tax - discount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, tax, discount, total };
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claimsData?.claims?.sub) return err("Unauthorized", 401);
    const user = { id: claimsData.claims.sub as string };

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Explicit ownership check for draft mutations: the service client bypasses RLS,
    // so never rely on the scoped read alone. Owner, admin, CEO or pharmacist may edit a draft.
    let managerRoleCache: boolean | null = null;
    const isDraftManager = async (): Promise<boolean> => {
      if (managerRoleCache !== null) return managerRoleCache;
      const { data: roles } = await serviceClient.from("user_roles").select("role").eq("user_id", user.id);
      managerRoleCache = (roles || []).some((r: { role: string }) => ["admin", "ceo", "pharmacist"].includes(r.role));
      return managerRoleCache;
    };
    const assertCanEditDraft = async (documentId: string): Promise<string | null> => {
      const { data: d } = await serviceClient.from("documents").select("id, user_id, status").eq("id", documentId).single();
      if (!d) return "Document not found";
      if (d.status !== "draft") return "Only draft documents can be edited";
      if (d.user_id !== user.id && !(await isDraftManager())) return "You cannot edit another user's draft";
      return null;
    };

    // ── CREATE DRAFT ──
    if (action === "create_draft") {
      const body = await req.json();
      const {
        category,
        sub_type,
        document_type_id,
        external_ref,
        customer_name,
        notes,
        tax = 0,
        discount = 0,
        amount: directAmount,
        subtotal: directSubtotal,
        total: directTotal,
        items = [],
        metadata = {},
        document_date,
      } = body;

      if (!category?.trim()) return err("Category is required");
      if (!sub_type?.trim()) return err("Sub-type is required");

      // Validate items
      if (!Array.isArray(items)) return err("Items must be an array");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.product_id) return err(`Item ${i + 1}: product_id is required`);
        if (typeof item.quantity !== "number" || item.quantity <= 0)
          return err(`Item ${i + 1}: quantity must be a positive number`);
        if (typeof item.unit_price !== "number" || item.unit_price < 0)
          return err(`Item ${i + 1}: unit_price must be non-negative`);
      }

      if (typeof tax !== "number" || tax < 0) return err("Tax must be non-negative");
      if (typeof discount !== "number" || discount < 0) return err("Discount must be non-negative");

      // For expense types without items, compute subtotal from metadata or direct amount
      let expenseSubtotal = 0;
      if (items.length === 0) {
        if (typeof directSubtotal === "number" && directSubtotal > 0) {
          expenseSubtotal = directSubtotal;
        } else if (typeof directAmount === "number" && directAmount > 0) {
          expenseSubtotal = directAmount;
        } else if (category === "Expenses" && metadata) {
          // Utility bills: units * rate
          if (metadata.units_consumed && metadata.rate_per_unit) {
            expenseSubtotal = Math.round(Number(metadata.units_consumed) * Number(metadata.rate_per_unit) * 100) / 100;
          }
          // Payroll: salary + bonus - deductions
          if (metadata.salary_amount !== undefined) {
            const salary = Number(metadata.salary_amount) || 0;
            const bonus = Number(metadata.bonus) || 0;
            const deductions = Number(metadata.deductions) || 0;
            expenseSubtotal = Math.round((salary + bonus - deductions) * 100) / 100;
          }
        }
      }

      // Calculate totals
      const totals = items.length > 0
        ? calcTotals(items, tax, discount)
        : { subtotal: expenseSubtotal, tax, discount, total: typeof directTotal === "number" && directTotal > 0 ? directTotal : Math.round((expenseSubtotal + tax - discount) * 100) / 100 };

      // Backdate support for admin/CEO on Expenses
      let backdatedAt: string | null = null;
      let backdatedPeriod: string | null = null;
      if (document_date && typeof document_date === "string") {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        const { data: isCeo } = await supabase.rpc("has_role", { _user_id: user.id, _role: "ceo" });
        if (!isAdmin && !isCeo) return err("Only admin or CEO can backdate documents", 403);
        if (category.trim() !== "Expenses") return err("Backdating is only allowed for Expenses", 400);
        const d = new Date(document_date + "T12:00:00Z");
        if (isNaN(d.getTime())) return err("Invalid document_date", 400);
        if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return err("document_date cannot be in the future", 400);
        backdatedAt = d.toISOString();
        backdatedPeriod = document_date;
      }

      // Insert draft document (no doc_number)
      const insertPayload: Record<string, unknown> = {
        category: category.trim(),
        sub_type: sub_type.trim(),
        document_type_id: document_type_id || null,
        user_id: user.id,
        external_ref: external_ref?.trim() || null,
        customer_name: customer_name?.trim() || null,
        notes: notes?.trim() || null,
        status: "draft",
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        amount: totals.total,
        quantity: items.length,
        metadata: metadata || {},
      };
      if (backdatedAt) {
        insertPayload.created_at = backdatedAt;
        insertPayload.period_date = backdatedPeriod;
      }

      const { data: doc, error: docErr } = await serviceClient
        .from("documents")
        .insert(insertPayload)
        .select()
        .single();

      if (docErr) return err(docErr.message, 500);

      // Insert line items
      if (items.length > 0) {
        const lineItems = items.map((item: any) => ({
          document_id: doc.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: calcLineAmount(item.quantity, item.unit_price),
          batch_number: item.batch_number?.trim() || null,
          expiry_date: item.expiry_date || null,
          notes: item.notes?.trim() || null,
        }));

        const { error: itemsErr } = await serviceClient
          .from("document_items")
          .insert(lineItems);

        if (itemsErr) {
          // Rollback: delete the draft document
          await serviceClient.from("documents").delete().eq("id", doc.id);
          return err(`Failed to save items: ${itemsErr.message}`, 500);
        }
      }

      // Fetch complete document with items
      const { data: fullDoc } = await serviceClient
        .from("documents")
        .select("*, document_items(*, products(id, name, category))")
        .eq("id", doc.id)
        .single();

      return json(fullDoc, 201);
    }

    // ── ADD ITEM TO DRAFT ──
    if (action === "add_item") {
      const body = await req.json();
      const { document_id, product_id, quantity, unit_price, batch_number, expiry_date, notes: itemNotes } = body;

      if (!document_id) return err("document_id is required");
      if (!product_id) return err("product_id is required");
      if (typeof quantity !== "number" || quantity <= 0) return err("quantity must be positive");
      if (typeof unit_price !== "number" || unit_price < 0) return err("unit_price must be non-negative");

      // Verify document is in draft state
      const { data: doc } = await supabase
        .from("documents")
        .select("id, status")
        .eq("id", document_id)
        .single();
      if (!doc) return err("Document not found", 404);
      if (doc.status !== "draft") return err("Can only add items to draft documents");
      { const denied = await assertCanEditDraft(document_id); if (denied) return err(denied, 403); }

      // Check for duplicate product in this document
      const { data: existing } = await supabase
        .from("document_items")
        .select("id")
        .eq("document_id", document_id)
        .eq("product_id", product_id)
        .maybeSingle();
      if (existing) return err("Product already exists in this document. Update the existing line instead.");

      const amount = calcLineAmount(quantity, unit_price);

      const { data: item, error: itemErr } = await serviceClient
        .from("document_items")
        .insert({
          document_id,
          product_id,
          quantity,
          unit_price,
          amount,
          batch_number: batch_number?.trim() || null,
          expiry_date: expiry_date || null,
          notes: itemNotes?.trim() || null,
        })
        .select("*, products(id, name, category)")
        .single();

      if (itemErr) return err(itemErr.message, 500);

      // Recalculate document totals
      const { data: totals } = await serviceClient.rpc("recalculate_document_totals", {
        p_document_id: document_id,
      });

      return json({ item, totals });
    }

    // ── UPDATE ITEM ──
    if (action === "update_item") {
      const body = await req.json();
      const { item_id, quantity, unit_price, batch_number, expiry_date, notes: itemNotes } = body;

      if (!item_id) return err("item_id is required");

      // Get item and verify draft status
      const { data: item } = await supabase
        .from("document_items")
        .select("id, document_id, documents(status)")
        .eq("id", item_id)
        .single();
      if (!item) return err("Item not found", 404);
      if ((item as any).documents?.status !== "draft") return err("Can only edit items in draft documents");
      { const denied = await assertCanEditDraft((item as any).document_id); if (denied) return err(denied, 403); }

      const updates: Record<string, unknown> = {};
      if (typeof quantity === "number" && quantity > 0) updates.quantity = quantity;
      if (typeof unit_price === "number" && unit_price >= 0) updates.unit_price = unit_price;
      if (batch_number !== undefined) updates.batch_number = batch_number?.trim() || null;
      if (expiry_date !== undefined) updates.expiry_date = expiry_date || null;
      if (itemNotes !== undefined) updates.notes = itemNotes?.trim() || null;

      // Recalculate line amount
      const newQty = (updates.quantity as number) ?? item.quantity;
      const newPrice = (updates.unit_price as number) ?? item.unit_price;
      updates.amount = calcLineAmount(newQty, newPrice);

      const { data: updated, error: updateErr } = await serviceClient
        .from("document_items")
        .update(updates)
        .eq("id", item_id)
        .select("*, products(id, name, category)")
        .single();

      if (updateErr) return err(updateErr.message, 500);

      const { data: totals } = await serviceClient.rpc("recalculate_document_totals", {
        p_document_id: item.document_id,
      });

      return json({ item: updated, totals });
    }

    // ── REMOVE ITEM ──
    if (action === "remove_item") {
      const body = await req.json();
      const { item_id } = body;
      if (!item_id) return err("item_id is required");

      const { data: item } = await supabase
        .from("document_items")
        .select("id, document_id, documents(status)")
        .eq("id", item_id)
        .single();
      if (!item) return err("Item not found", 404);
      if ((item as any).documents?.status !== "draft") return err("Can only remove items from draft documents");
      { const denied = await assertCanEditDraft((item as any).document_id); if (denied) return err(denied, 403); }

      const { error: delErr } = await serviceClient
        .from("document_items")
        .delete()
        .eq("id", item_id);
      if (delErr) return err(delErr.message, 500);

      const { data: totals } = await serviceClient.rpc("recalculate_document_totals", {
        p_document_id: item.document_id,
      });

      return json({ removed: item_id, totals });
    }

    // ── UPDATE DRAFT HEADER (tax, discount, notes, etc.) ──
    if (action === "update_draft") {
      const body = await req.json();
      const { document_id, tax, discount, customer_name, external_ref, notes, category, sub_type, document_type_id, metadata } = body;
      if (!document_id) return err("document_id is required");

      const { data: doc } = await supabase
        .from("documents")
        .select("id, status")
        .eq("id", document_id)
        .single();
      if (!doc) return err("Document not found", 404);
      if (doc.status !== "draft") return err("Can only update draft documents");
      { const denied = await assertCanEditDraft(document_id); if (denied) return err(denied, 403); }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof tax === "number" && tax >= 0) updates.tax = tax;
      if (typeof discount === "number" && discount >= 0) updates.discount = discount;
      if (customer_name !== undefined) updates.customer_name = customer_name?.trim() || null;
      if (external_ref !== undefined) updates.external_ref = external_ref?.trim() || null;
      if (notes !== undefined) updates.notes = notes?.trim() || null;
      if (category) updates.category = category.trim();
      if (sub_type) updates.sub_type = sub_type.trim();
      if (document_type_id !== undefined) updates.document_type_id = document_type_id || null;
      if (metadata !== undefined) updates.metadata = metadata;

      const { error: updateErr } = await serviceClient
        .from("documents")
        .update(updates)
        .eq("id", document_id);
      if (updateErr) return err(updateErr.message, 500);

      // Recalculate totals (in case tax/discount changed)
      const { data: totals } = await serviceClient.rpc("recalculate_document_totals", {
        p_document_id: document_id,
      });

      // Return full updated document
      const { data: fullDoc } = await serviceClient
        .from("documents")
        .select("*, document_items(*, products(id, name, category))")
        .eq("id", document_id)
        .single();

      return json({ document: fullDoc, totals });
    }

    // ── GET DRAFT ──
    if (action === "get_draft") {
      const docId = url.searchParams.get("document_id");
      if (!docId) return err("document_id query param required");

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("*, document_items(*, products(id, name, category)), document_types(code, name, prefix)")
        .eq("id", docId)
        .single();
      if (docErr || !doc) return err("Document not found", 404);

      return json(doc);
    }

    // ── LIST DRAFTS ──
    if (action === "list_drafts") {
      const { data: drafts, error: draftsErr } = await supabase
        .from("documents")
        .select("id, category, sub_type, customer_name, subtotal, tax, discount, total, quantity, created_at, updated_at, document_types(code, name)")
        .eq("status", "draft")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (draftsErr) return err(draftsErr.message, 500);
      return json(drafts);
    }

    // ── CALCULATE (stateless preview) ──
    if (action === "calculate") {
      const body = await req.json();
      const { items = [], tax = 0, discount = 0 } = body;

      if (!Array.isArray(items)) return err("Items must be an array");

      const lineDetails = items.map((item: any, i: number) => ({
        index: i,
        product_id: item.product_id,
        quantity: item.quantity || 0,
        unit_price: item.unit_price || 0,
        amount: calcLineAmount(item.quantity || 0, item.unit_price || 0),
      }));

      const totals = calcTotals(items, tax, discount);

      return json({ lines: lineDetails, ...totals });
    }

    // ── CONFIRM DOCUMENT ──
    if (action === "confirm") {
      const body = await req.json();
      const { document_id } = body;
      if (!document_id) return err("document_id is required");

      // Verify ownership or admin
      const { data: doc } = await supabase
        .from("documents")
        .select("id, status, user_id")
        .eq("id", document_id)
        .single();
      if (!doc) return err("Document not found", 404);
      if (doc.status !== "draft") return err(`Document is already ${doc.status}`);

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (doc.user_id !== user.id && !isAdmin) {
        return err("You can only confirm your own documents", 403);
      }

      // Call the atomic confirm function
      const { data: result, error: confirmErr } = await serviceClient.rpc("confirm_document", {
        p_document_id: document_id,
        p_user_id: user.id,
      });

      if (confirmErr) return err(confirmErr.message, 500);

      // Return full confirmed document
      const { data: confirmed } = await serviceClient
        .from("documents")
        .select("*, document_items(*, products(id, name, category)), document_types(code, name, prefix)")
        .eq("id", document_id)
        .single();

      return json({ ...result, document: confirmed });
    }

    // ── VOID DOCUMENT (deactivate, no delete) ──
    if (action === "void") {
      const body = await req.json();
      const { document_id, reason } = body;
      if (!document_id) return err("document_id is required");
      if (!reason?.trim()) return err("Reason is required to void a document");

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) return err("Only admin can void documents", 403);

      const { data: doc } = await supabase
        .from("documents")
        .select("id, status, doc_number")
        .eq("id", document_id)
        .single();
      if (!doc) return err("Document not found", 404);
      if (doc.status === "voided") return err("Document is already voided");

      const { error: voidErr } = await serviceClient
        .from("documents")
        .update({ status: "voided", notes: `VOIDED: ${reason.trim()}`, updated_at: new Date().toISOString() })
        .eq("id", document_id);

      if (voidErr) return err(voidErr.message, 500);

      // Log activity
      await serviceClient.from("activity_log").insert({
        user_id: user.id,
        action: `Voided document: ${reason.trim()}`,
        module: "Documents",
        document_ref: doc.doc_number,
      });

      return json({ status: "voided", document_id, doc_number: doc.doc_number });
    }

    // ── ADD PAYMENT ──
    if (action === "add_payment") {
      const body = await req.json();
      const { document_id, amount, payment_type_id, reference, paid_by } = body;

      if (!document_id) return err("document_id is required");
      if (typeof amount !== "number" || amount <= 0) return err("amount must be a positive number");

      const { data: result, error: payErr } = await serviceClient.rpc("add_document_payment", {
        p_document_id: document_id,
        p_user_id: user.id,
        p_amount: amount,
        p_payment_type_id: payment_type_id || null,
        p_reference: reference?.trim() || null,
        p_paid_by: paid_by?.trim() || null,
      });

      if (payErr) return err(payErr.message, 500);
      return json(result);
    }

    // ── LIST PAYMENTS FOR DOCUMENT ──
    if (action === "list_payments") {
      const docId = url.searchParams.get("document_id");
      if (!docId) return err("document_id query param required");

      const { data: payments, error: listErr } = await supabase
        .from("payments")
        .select("*, payment_types(name, code)")
        .eq("document_id", docId)
        .order("paid_at", { ascending: true });

      if (listErr) return err(listErr.message, 500);

      // Also fetch document payment summary
      const { data: doc } = await supabase
        .from("documents")
        .select("total, amount_paid, balance_due, payment_status")
        .eq("id", docId)
        .single();

      return json({ payments: payments || [], summary: doc });
    }

    // ── CANCEL PAYMENT (status flag, no delete) ──
    if (action === "cancel_payment") {
      const body = await req.json();
      const { payment_id, reason } = body;
      if (!payment_id) return err("payment_id is required");
      if (!reason?.trim()) return err("Reason is required");

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) return err("Only admin can cancel payments", 403);

      const { data: payment } = await supabase
        .from("payments")
        .select("id, document_id, amount, status")
        .eq("id", payment_id)
        .single();
      if (!payment) return err("Payment not found", 404);
      if (payment.status === "cancelled") return err("Payment is already cancelled");

      // Cancel payment and reverse amounts on document atomically
      const { error: cancelErr } = await serviceClient
        .from("payments")
        .update({ status: "cancelled" })
        .eq("id", payment_id);
      if (cancelErr) return err(cancelErr.message, 500);

      // Recalculate document paid/balance from non-cancelled payments
      const { data: validPayments } = await serviceClient
        .from("payments")
        .select("amount")
        .eq("document_id", payment.document_id)
        .eq("status", "completed");

      const totalPaid = (validPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

      const { data: doc } = await serviceClient
        .from("documents")
        .select("total")
        .eq("id", payment.document_id)
        .single();

      const balance = (doc?.total || 0) - totalPaid;
      const payStatus = balance <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

      await serviceClient.from("documents").update({
        amount_paid: totalPaid,
        balance_due: Math.max(balance, 0),
        payment_status: payStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", payment.document_id);

      await serviceClient.from("activity_log").insert({
        user_id: user.id,
        action: `Cancelled payment of ${payment.amount}: ${reason.trim()}`,
        module: "Payments",
        document_ref: payment_id,
      });

      return json({ cancelled: payment_id, amount_paid: totalPaid, balance_due: Math.max(balance, 0), payment_status: payStatus });
    }

    // ── AUDIT LOG FOR DOCUMENT ──
    if (action === "audit_log") {
      const docId = url.searchParams.get("document_id");
      if (!docId) return err("document_id query param required");

      // Admin/CEO only
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: isCeo } = await supabase.rpc("has_role", { _user_id: user.id, _role: "ceo" });
      if (!isAdmin && !isCeo) return err("Admin or CEO access required", 403);

      const { data: logs, error: logErr } = await serviceClient
        .from("document_audit_log")
        .select("*, profiles!document_audit_log_performed_by_fkey(full_name, username)")
        .eq("document_id", docId)
        .order("created_at", { ascending: true });

      if (logErr) {
        // Fallback without join if FK not set up
        const { data: logsPlain } = await serviceClient
          .from("document_audit_log")
          .select("*")
          .eq("document_id", docId)
          .order("created_at", { ascending: true });

        // Manually resolve user names
        const userIds = [...new Set((logsPlain || []).map((l: any) => l.performed_by))];
        const { data: profiles } = await serviceClient
          .from("profiles")
          .select("user_id, full_name, username")
          .in("user_id", userIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        const enriched = (logsPlain || []).map((log: any) => ({
          ...log,
          performed_by_name: profileMap.get(log.performed_by)?.full_name || "Unknown",
          performed_by_username: profileMap.get(log.performed_by)?.username || null,
        }));

        return json(enriched);
      }

      return json(logs);
    }

    // ── GLOBAL AUDIT LOG (recent activity) ──
    if (action === "recent_activity") {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: isCeo } = await supabase.rpc("has_role", { _user_id: user.id, _role: "ceo" });
      if (!isAdmin && !isCeo) return err("Admin or CEO access required", 403);

      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const { data: logs } = await serviceClient
        .from("document_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + Math.min(limit, 200) - 1);

      // Resolve user names
      const userIds = [...new Set((logs || []).map((l: any) => l.performed_by))];
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      // Resolve document numbers
      const docIds = [...new Set((logs || []).map((l: any) => l.document_id))];
      const { data: docs } = await serviceClient
        .from("documents")
        .select("id, doc_number, category")
        .in("id", docIds);
      const docMap = new Map((docs || []).map((d: any) => [d.id, d]));

      const enriched = (logs || []).map((log: any) => ({
        ...log,
        performed_by_name: profileMap.get(log.performed_by)?.full_name || "Unknown",
        doc_number: docMap.get(log.document_id)?.doc_number || null,
        category: docMap.get(log.document_id)?.category || null,
      }));

      return json(enriched);
    }

    // ── EDIT HISTORICAL PURCHASE (admin/CEO) ──
    // Corrects qty/unit_price on a confirmed Purchase document, then REBUILDS
    // each affected product's stock from its complete movement history:
    //   current_qty = Σ in.quantity − Σ out.quantity   (starting from 0)
    // which is exactly:
    //   opening + corrected goods received − sales − reductions + additions
    // Every movement's quantity_before / quantity_after is also re-stamped in
    // chronological order so Stock-by-Date queries match the rebuilt timeline.
    // Sales rows are never touched.
    if (action === "edit_historical") {
      const body = await req.json();
      const { document_id, items, new_items, removed_item_ids } = body as {
        document_id: string;
        items?: Array<{ item_id: string; quantity?: number; unit_price?: number }>;
        new_items?: Array<{ product_id: string; quantity: number; unit_price: number; batch_number?: string; expiry_date?: string }>;
        removed_item_ids?: string[];
      };

      if (!document_id) return err("document_id is required");
      const safeItems = Array.isArray(items) ? items : [];
      const safeNew = Array.isArray(new_items) ? new_items : [];
      const safeRemoved = Array.isArray(removed_item_ids) ? removed_item_ids : [];
      if (safeItems.length === 0 && safeNew.length === 0 && safeRemoved.length === 0) {
        return err("Provide items, new_items, or removed_item_ids");
      }

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: isCeo } = await supabase.rpc("has_role", { _user_id: user.id, _role: "ceo" });
      if (!isAdmin && !isCeo) return err("Only admin or CEO can edit historical documents", 403);

      const { data: doc } = await serviceClient
        .from("documents")
        .select("id, status, category, doc_number, external_ref, created_at")
        .eq("id", document_id)
        .single();
      if (!doc) return err("Document not found", 404);
      if (doc.category !== "Purchases") return err("Only Purchase documents can be edited historically");
      if (!["confirmed", "posted", "completed"].includes(doc.status)) {
        return err(`Document status '${doc.status}' is not editable historically`);
      }

      // Find sibling/duplicate purchase documents that share the same invoice
      // reference (external_ref). When the same supplier invoice was recorded
      // multiple times, a correction on one must propagate to all of them so
      // stock doesn't stay inflated by the duplicates.
      const siblingDocIds: string[] = [];
      const propagatePropagated = (body as any).propagate_duplicates !== false; // default true
      const refKey = (doc.external_ref || "").trim();
      if (propagatePropagated && refKey) {
        const { data: sibs } = await serviceClient
          .from("documents")
          .select("id, doc_number, status")
          .eq("category", "Purchases")
          .eq("external_ref", refKey)
          .neq("id", document_id);
        for (const s of sibs || []) {
          if (["confirmed", "posted", "completed"].includes(s.status)) {
            siblingDocIds.push(s.id);
          }
        }
      }

      const changes: any[] = [];
      const propagated: any[] = [];
      const affectedProductIds = new Set<string>();
      const affectedDocIds = new Set<string>([document_id, ...siblingDocIds]);

      // 1) Apply corrections to document_items and the originating stock_movements row.
      for (const upd of safeItems) {
        if (!upd.item_id) continue;

        const { data: existing } = await serviceClient
          .from("document_items")
          .select("id, document_id, product_id, quantity, unit_price, amount")
          .eq("id", upd.item_id)
          .eq("document_id", document_id)
          .single();
        if (!existing) continue;

        const newQty = typeof upd.quantity === "number" && upd.quantity > 0 ? upd.quantity : existing.quantity;
        const newPrice = typeof upd.unit_price === "number" && upd.unit_price >= 0 ? upd.unit_price : Number(existing.unit_price);
        const newAmount = calcLineAmount(newQty, newPrice);

        if (newQty === existing.quantity && newPrice === Number(existing.unit_price)) continue;

        // Apply to the edited line itself
        await serviceClient
          .from("document_items")
          .update({ quantity: newQty, unit_price: newPrice, amount: newAmount })
          .eq("id", existing.id);

        if (newQty !== existing.quantity) {
          await serviceClient
            .from("stock_movements")
            .update({
              quantity: newQty,
              reason: `Historical correction by ${isAdmin ? "admin" : "CEO"} — was ${existing.quantity}`,
            })
            .eq("document_id", document_id)
            .eq("product_id", existing.product_id);
          affectedProductIds.add(existing.product_id);
        }

        changes.push({
          item_id: existing.id,
          product_id: existing.product_id,
          old: { quantity: existing.quantity, unit_price: Number(existing.unit_price) },
          new: { quantity: newQty, unit_price: newPrice },
        });

        // Propagate the SAME correction to matching lines on duplicate docs
        // (same external_ref). Match by product_id within the sibling doc.
        for (const sibId of siblingDocIds) {
          const { data: sibItems } = await serviceClient
            .from("document_items")
            .select("id, document_id, product_id, quantity, unit_price")
            .eq("document_id", sibId)
            .eq("product_id", existing.product_id);
          for (const sit of sibItems || []) {
            const sitOldQty = Number(sit.quantity);
            const sitOldPrice = Number(sit.unit_price);
            if (sitOldQty === newQty && sitOldPrice === newPrice) continue;
            await serviceClient
              .from("document_items")
              .update({
                quantity: newQty,
                unit_price: newPrice,
                amount: calcLineAmount(newQty, newPrice),
              })
              .eq("id", sit.id);
            if (sitOldQty !== newQty) {
              await serviceClient
                .from("stock_movements")
                .update({
                  quantity: newQty,
                  reason: `Historical correction (duplicate invoice ${refKey}) — was ${sitOldQty}`,
                })
                .eq("document_id", sibId)
                .eq("product_id", existing.product_id);
              affectedProductIds.add(existing.product_id);
            }
            propagated.push({
              document_id: sibId,
              item_id: sit.id,
              product_id: existing.product_id,
              old: { quantity: sitOldQty, unit_price: sitOldPrice },
              new: { quantity: newQty, unit_price: newPrice },
            });
          }
        }
      }

      // 1b) Remove items (historical) — delete the line + its stock movement on this doc.
      const removed: any[] = [];
      for (const removeId of safeRemoved) {
        const { data: existing } = await serviceClient
          .from("document_items")
          .select("id, product_id, quantity, unit_price")
          .eq("id", removeId)
          .eq("document_id", document_id)
          .single();
        if (!existing) continue;

        await serviceClient
          .from("stock_movements")
          .delete()
          .eq("document_id", document_id)
          .eq("product_id", existing.product_id);

        await serviceClient.from("document_items").delete().eq("id", existing.id);

        affectedProductIds.add(existing.product_id);
        removed.push({
          item_id: existing.id,
          product_id: existing.product_id,
          quantity: Number(existing.quantity),
          unit_price: Number(existing.unit_price),
        });
      }

      // 1c) Add new items (historical) — insert the line + a stock-in movement
      // dated to the document's original created_at so Stock by Date reflects it.
      const added: any[] = [];
      for (const ni of safeNew) {
        if (!ni?.product_id) continue;
        const qty = Number(ni.quantity);
        const price = Number(ni.unit_price);
        if (!(qty > 0) || !(price >= 0)) continue;

        // Avoid duplicating a product line on the same doc — if it exists,
        // merge by stacking quantity onto the existing line via the normal
        // correction path instead.
        const { data: dup } = await serviceClient
          .from("document_items")
          .select("id, quantity, unit_price")
          .eq("document_id", document_id)
          .eq("product_id", ni.product_id)
          .maybeSingle();
        if (dup) {
          const mergedQty = Number(dup.quantity) + qty;
          const mergedPrice = price > 0 ? price : Number(dup.unit_price);
          await serviceClient
            .from("document_items")
            .update({
              quantity: mergedQty,
              unit_price: mergedPrice,
              amount: calcLineAmount(mergedQty, mergedPrice),
            })
            .eq("id", dup.id);
          await serviceClient
            .from("stock_movements")
            .update({
              quantity: mergedQty,
              reason: `Historical add (merged) by ${isAdmin ? "admin" : "CEO"} — was ${dup.quantity}`,
            })
            .eq("document_id", document_id)
            .eq("product_id", ni.product_id);
          affectedProductIds.add(ni.product_id);
          added.push({ item_id: dup.id, product_id: ni.product_id, quantity: mergedQty, unit_price: mergedPrice, merged: true });
          continue;
        }

        const { data: newItem, error: addErr } = await serviceClient
          .from("document_items")
          .insert({
            document_id,
            product_id: ni.product_id,
            quantity: qty,
            unit_price: price,
            amount: calcLineAmount(qty, price),
            batch_number: ni.batch_number?.trim() || null,
            expiry_date: ni.expiry_date || null,
          })
          .select("id")
          .single();
        if (addErr) continue;

        await serviceClient.from("stock_movements").insert({
          product_id: ni.product_id,
          document_id,
          movement_type: "in",
          quantity: qty,
          quantity_before: 0,
          quantity_after: 0,
          reason: `Historical add by ${isAdmin ? "admin" : "CEO"} — line added to ${doc.doc_number}`,
          user_id: user.id,
          created_at: (doc as any).created_at,
        });

        affectedProductIds.add(ni.product_id);
        added.push({ item_id: newItem.id, product_id: ni.product_id, quantity: qty, unit_price: price });
      }


      const rebuildSummary: any[] = [];
      for (const productId of affectedProductIds) {
        const { data: prodBefore } = await serviceClient
          .from("products")
          .select("id, name, qty")
          .eq("id", productId)
          .single();
        if (!prodBefore) continue;

        const { data: movs } = await serviceClient
          .from("stock_movements")
          .select("id, movement_type, quantity, created_at")
          .eq("product_id", productId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        // Walk chronologically: start from 0 (the very first 'in' is the
        // opening stock movement created when the product was added).
        let running = 0;
        for (const m of movs || []) {
          const before = running;
          const qty = Number(m.quantity);
          if (m.movement_type === "in") {
            running = before + qty;
          } else if (m.movement_type === "out") {
            running = before - qty;
          } else {
            // 'adjustment' / 'set' — treat quantity as the new absolute balance
            running = qty;
          }
          await serviceClient
            .from("stock_movements")
            .update({ quantity_before: before, quantity_after: running })
            .eq("id", m.id);
        }

        const newCurrent = Math.max(0, running);
        await serviceClient.from("products").update({ qty: newCurrent }).eq("id", productId);

        // Per-product audit row
        const corrected = changes.find((c) => c.product_id === productId);
        rebuildSummary.push({
          product_id: productId,
          product_name: prodBefore.name,
          previous_stock: Number(prodBefore.qty),
          corrected_received_qty: corrected?.new?.quantity ?? null,
          previous_received_qty: corrected?.old?.quantity ?? null,
          new_stock: newCurrent,
          movement_count: (movs || []).length,
        });

        try {
          await serviceClient.from("inventory_audit_logs").insert({
            user_id: user.id,
            action: "stock_rebuild",
            entity_type: "products",
            entity_id: productId,
            details: {
              document_ref: doc.doc_number,
              product_name: prodBefore.name,
              previous_stock: Number(prodBefore.qty),
              previous_received_qty: corrected?.old?.quantity ?? null,
              corrected_received_qty: corrected?.new?.quantity ?? null,
              new_stock: newCurrent,
              rebuilt_from_movements: (movs || []).length,
              rebuilt_at: new Date().toISOString(),
            },
          });
        } catch (_e) { /* table optional in older deployments */ }
      }

      // Recalculate totals for every affected document (edited + duplicates)
      let totals: any = null;
      for (const did of affectedDocIds) {
        const { data: t } = await serviceClient.rpc("recalculate_document_totals", {
          p_document_id: did,
        });
        if (did === document_id) totals = t;
      }

      await serviceClient.from("activity_log").insert({
        user_id: user.id,
        action: `Historical edit of purchase ${doc.doc_number} — stock rebuilt (${rebuildSummary.length} product${rebuildSummary.length !== 1 ? "s" : ""})${siblingDocIds.length ? `, propagated to ${siblingDocIds.length} duplicate invoice doc(s)` : ""}`,
        module: "Documents",
        document_ref: doc.doc_number,
      });

      try {
        await serviceClient.from("document_audit_log").insert({
          document_id,
          action: "historical_edit",
          old_values: { items: changes.map((c) => c.old) },
          new_values: {
            items: changes.map((c) => c.new),
            rebuild: rebuildSummary,
            propagated_to: siblingDocIds,
            propagated_changes: propagated,
          },
          performed_by: user.id,
        });
      } catch (_e) { /* audit table optional */ }

      const { data: fullDoc } = await serviceClient
        .from("documents")
        .select("*, document_items(*, products(id, name, category))")
        .eq("id", document_id)
        .single();

      return json({
        document: fullDoc,
        totals,
        changes_count: changes.length + propagated.length + added.length + removed.length,
        propagated_count: propagated.length,
        added_count: added.length,
        removed_count: removed.length,
        duplicate_docs: siblingDocIds.length,
        stock_rebuilt: true,
        rebuild: rebuildSummary,
      });
    }


    return err("Invalid action. Use: create_draft, add_item, update_item, remove_item, update_draft, get_draft, list_drafts, calculate, confirm, void, add_payment, list_payments, cancel_payment, audit_log, recent_activity, edit_historical");
  } catch (e) {
    return err(e.message || "Internal server error", 500);
  }
});
