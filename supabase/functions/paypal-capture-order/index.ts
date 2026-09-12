import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function paypalBase(env: string | null) {
  return env === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function paypalToken(base: string, clientId: string, secret: string) {
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `PayPal rechazó las credenciales: ${payload?.error_description ?? response.status}`,
    );
  }
  return payload.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const paypalOrderId = String(body.paypalOrderId ?? "").trim();

    if (!paypalOrderId) {
      throw new Error("Falta el identificador de la orden de PayPal");
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("paypal_order_id", paypalOrderId)
      .single();

    if (orderError || !order) {
      throw new Error("No se encontró el pedido asociado a ese pago");
    }

    // El navegador puede llamar dos veces (una recarga, un doble clic).
    // Si ya está encargado, no se cobra ni se fabrica nada otra vez.
    if (order.printful_order_id) {
      return reply({ ok: true, yaProcesado: true, orderId: order.id });
    }

    const [{ data: settings }, { data: secret }, { data: env }, { data: printfulKey }] =
      await Promise.all([
        supabase.from("site_settings").select("paypal_client_id").eq("id", 1).maybeSingle(),
        supabase.rpc("get_secret", { secret_name: "PAYPAL_SECRET" }),
        supabase.rpc("get_secret", { secret_name: "PAYPAL_ENV" }),
        supabase.rpc("get_secret", { secret_name: "PRINTFUL_API_KEY" }),
      ]);

    // El Client ID es público y vive en los ajustes; el secreto, en el Vault.
    const clientId = settings?.paypal_client_id;
    if (!clientId || !secret) {
      throw new Error("Faltan las credenciales de PayPal (Client ID en los ajustes, secreto en el Vault)");
    }
    if (!printfulKey) {
      throw new Error("Falta PRINTFUL_API_KEY en el Vault de Supabase");
    }

    const base = paypalBase(env);
    const token = await paypalToken(base, clientId, secret);

    const captureResponse = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        // Si la petición se repite, PayPal devuelve el mismo cobro en
        // lugar de hacer otro.
        "PayPal-Request-Id": `capture-${paypalOrderId}`,
      },
    });

    const captured = await captureResponse.json().catch(() => ({}));

    if (!captureResponse.ok || captured.status !== "COMPLETED") {
      throw new Error(
        `PayPal no completó el cobro: ${captured?.message ?? captured?.status ?? captureResponse.status}`,
      );
    }

    const unit = captured.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const paid = Number(capture?.amount?.value);
    const paidCurrency = String(capture?.amount?.currency_code ?? "").toUpperCase();
    const expected = Number(order.total_amount);

    // El importe lo fijamos nosotros al crear la orden, así que esto no
    // debería fallar nunca. Si falla, algo se ha manipulado: se guarda el
    // cobro pero no se fabrica nada, y queda a la vista en el panel.
    if (!Number.isFinite(paid) || Math.abs(paid - expected) > 0.009 ||
        paidCurrency !== String(order.currency ?? "").toUpperCase()) {
      await supabase.from("orders").update({
        status: "processing",
        payment_reference: capture?.id ?? paypalOrderId,
        customer_message: `REVISAR: PayPal cobró ${paid} ${paidCurrency} y el pedido era ${expected} ${order.currency}`,
      }).eq("id", order.id);

      throw new Error("El importe cobrado no coincide con el del pedido. Revísalo en el panel.");
    }

    const payer = captured.payer ?? {};
    const shipping = unit?.shipping ?? {};
    const address = shipping.address ?? {};

    const nombre = shipping.name?.full_name
      ?? [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(" ")
      ?? null;

    if (!address.address_line_1 || !address.country_code) {
      // Pagado pero sin dirección utilizable: no se puede fabricar.
      await supabase.from("orders").update({
        status: "processing",
        payment_reference: capture?.id ?? paypalOrderId,
        customer_name: nombre,
        customer_email: payer.email_address ?? null,
        customer_message: "REVISAR: PayPal no devolvió dirección de envío",
      }).eq("id", order.id);

      throw new Error("PayPal no devolvió una dirección de envío. Revísalo en el panel.");
    }

    // En sandbox no se fabrica nada: el pedido entra en Printful como
    // borrador, igual que hacen las pruebas de Stripe.
    const esReal = env !== "sandbox";

    const printfulResponse = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${printfulKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          name: nombre,
          address1: address.address_line_1,
          address2: address.address_line_2 ?? undefined,
          city: address.admin_area_2,
          state_code: address.admin_area_1 ?? undefined,
          country_code: address.country_code,
          zip: address.postal_code,
          email: payer.email_address ?? undefined,
        },
        items: (order.order_items ?? []).map((oi: any) => ({
          sync_variant_id: oi.printful_sync_variant_id,
          quantity: oi.quantity,
        })),
        confirm: esReal,
      }),
    });

    const printfulResult = await printfulResponse.json().catch(() => ({}));

    // El dinero ya está cobrado pase lo que pase, así que el pedido pasa
    // a 'processing' igualmente. Si Printful falla, printful_order_id se
    // queda vacío y se ve en el panel.
    const update: Record<string, unknown> = {
      status: "processing",
      payment_reference: capture?.id ?? paypalOrderId,
      livemode: esReal,
      customer_name: nombre,
      customer_email: payer.email_address ?? null,
      shipping_address: { name: nombre, ...address },
    };

    if (printfulResponse.ok) {
      update.printful_order_id = printfulResult.result?.id;
    } else {
      console.error("Printful error:", JSON.stringify(printfulResult));
    }

    await supabase.from("orders").update(update).eq("id", order.id);

    if (!printfulResponse.ok) {
      throw new Error(
        `Cobro correcto, pero Printful falló: ${JSON.stringify(printfulResult?.error ?? printfulResult)}`,
      );
    }

    return reply({ ok: true, orderId: order.id });
  } catch (error) {
    console.error("paypal-capture-order error:", error);
    return reply({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
