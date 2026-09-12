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

// Una venta que llega y nadie ve es casi peor que no venderla. El aviso
// nunca puede tumbar el cobro, así que va entero dentro de un try.
async function avisar(datos: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-telegram-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ type: "sale", ...datos }),
    });
  } catch (error) {
    console.error("No se pudo avisar por Telegram:", error);
  }
}

function direccionLegible(a: Record<string, any>) {
  return [
    a.address_line_1,
    a.address_line_2,
    a.admin_area_2,
    a.admin_area_1,
    a.postal_code,
    a.country_code,
  ].filter(Boolean).join(", ");
}

// Los nombres de país que devuelve Printful en sus errores vienen en
// inglés; para el comprador basta con saber que no llegamos allí.
function recipienteParaPrintful(nombre: string | null, a: Record<string, any>, email?: string) {
  return {
    name: nombre,
    address1: a.address_line_1,
    address2: a.address_line_2 ?? undefined,
    city: a.admin_area_2,
    state_code: a.admin_area_1 ?? undefined,
    country_code: a.country_code,
    zip: a.postal_code,
    email: email ?? undefined,
  };
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
    const esReal = env !== "sandbox";

    const articulos = (order.order_items ?? []).map((oi: any) => ({
      name: oi.product_name,
      size: oi.size,
      quantity: oi.quantity,
    }));

    // ------------------------------------------------------------------
    // 1. Leer la orden aprobada SIN cobrarla todavía.
    //
    // Hasta aquí el comprador ha dado su visto bueno en PayPal, pero el
    // dinero sigue en su cuenta. Es el único momento en que aún podemos
    // echarnos atrás sin tener que devolver nada.
    // ------------------------------------------------------------------
    const detalleResponse = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const detalle = await detalleResponse.json().catch(() => ({}));

    if (!detalleResponse.ok) {
      throw new Error(`No se pudo leer la orden en PayPal: ${detalle?.message ?? detalleResponse.status}`);
    }

    const unidad = detalle.purchase_units?.[0];
    const payer = detalle.payer ?? {};
    const envio = unidad?.shipping ?? {};
    const direccion = envio.address ?? {};

    const nombre = envio.name?.full_name
      ?? [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(" ")
      ?? null;

    if (!direccion.address_line_1 || !direccion.country_code) {
      await supabase.from("orders").update({
        status: "cancelled",
        customer_name: nombre,
        customer_email: payer.email_address ?? null,
        customer_message: "PayPal no devolvió dirección de envío. No se cobró nada.",
      }).eq("id", order.id);

      await avisar({
        outcome: "rechazada",
        orderId: order.id,
        total: order.total_amount,
        currency: order.currency,
        items: articulos,
        customerName: nombre,
        customerEmail: payer.email_address ?? null,
        detail: "PayPal no devolvió dirección de envío",
      });

      return reply({
        error: "PayPal no nos ha dado una dirección de envío, así que no hemos cobrado nada. Revisa la dirección de tu cuenta de PayPal e inténtalo otra vez.",
      }, 400);
    }

    // ------------------------------------------------------------------
    // 2. Preguntar a Printful si puede llegar allí.
    //
    // 'estimate-costs' no crea nada ni cuesta nada: solo responde. Si dice
    // que no, el comprador se entera ahora y con el dinero intacto, en
    // lugar de descubrirlo cuando ya se le ha cobrado.
    // ------------------------------------------------------------------
    const items = (order.order_items ?? []).map((oi: any) => ({
      sync_variant_id: oi.printful_sync_variant_id,
      quantity: oi.quantity,
    }));

    const estimacion = await fetch("https://api.printful.com/orders/estimate-costs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${printfulKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipienteParaPrintful(nombre, direccion, payer.email_address),
        items,
      }),
    });

    if (!estimacion.ok) {
      const fallo = await estimacion.json().catch(() => ({}));
      const motivo = fallo?.error?.message ?? fallo?.result ?? `Printful respondió ${estimacion.status}`;

      await supabase.from("orders").update({
        status: "cancelled",
        customer_name: nombre,
        customer_email: payer.email_address ?? null,
        shipping_address: { name: nombre, ...direccion },
        customer_message: `No enviable, no se cobró: ${motivo}`,
      }).eq("id", order.id);

      await avisar({
        outcome: "rechazada",
        orderId: order.id,
        total: order.total_amount,
        currency: order.currency,
        items: articulos,
        customerName: nombre,
        customerEmail: payer.email_address ?? null,
        address: direccionLegible(direccion),
        detail: motivo,
      });

      return reply({
        error: `No podemos enviar a esa dirección: ${motivo} No te hemos cobrado nada.`,
        noEnviable: true,
      }, 400);
    }

    // ------------------------------------------------------------------
    // 3. Ahora sí: cobrar.
    // ------------------------------------------------------------------
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

    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    const paid = Number(capture?.amount?.value);
    const paidCurrency = String(capture?.amount?.currency_code ?? "").toUpperCase();
    const expected = Number(order.total_amount);

    // El importe lo fijamos nosotros al crear la orden, así que esto no
    // debería fallar nunca. Si falla, algo se ha manipulado: se guarda el
    // cobro pero no se fabrica nada, y queda a la vista en el panel.
    if (!Number.isFinite(paid) || Math.abs(paid - expected) > 0.009 ||
        paidCurrency !== String(order.currency ?? "").toUpperCase()) {
      const motivo = `PayPal cobró ${paid} ${paidCurrency} y el pedido era ${expected} ${order.currency}`;

      await supabase.from("orders").update({
        status: "processing",
        payment_reference: capture?.id ?? paypalOrderId,
        customer_message: `REVISAR: ${motivo}`,
      }).eq("id", order.id);

      await avisar({
        outcome: "problema",
        orderId: order.id,
        total: paid,
        currency: paidCurrency || order.currency,
        items: articulos,
        customerName: nombre,
        customerEmail: payer.email_address ?? null,
        address: direccionLegible(direccion),
        detail: `Importe descuadrado. ${motivo}. No se ha encargado nada a Printful.`,
      });

      throw new Error("El importe cobrado no coincide con el del pedido. Revísalo en el panel.");
    }

    // ------------------------------------------------------------------
    // 4. Encargar la prenda.
    // ------------------------------------------------------------------
    const printfulResponse = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${printfulKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipienteParaPrintful(nombre, direccion, payer.email_address),
        items,
        confirm: esReal,
      }),
    });

    const printfulResult = await printfulResponse.json().catch(() => ({}));

    // El dinero ya está cobrado pase lo que pase, así que el pedido pasa
    // a 'processing' igualmente. Si Printful falla, printful_order_id se
    // queda vacío y el aviso lo dice.
    const update: Record<string, unknown> = {
      status: "processing",
      payment_reference: capture?.id ?? paypalOrderId,
      livemode: esReal,
      customer_name: nombre,
      customer_email: payer.email_address ?? null,
      shipping_address: { name: nombre, ...direccion },
    };

    if (printfulResponse.ok) {
      update.printful_order_id = printfulResult.result?.id;
    } else {
      console.error("Printful error:", JSON.stringify(printfulResult));
      update.customer_message = `REVISAR: cobrado, pero Printful falló: ${
        printfulResult?.error?.message ?? printfulResponse.status
      }`;
    }

    await supabase.from("orders").update(update).eq("id", order.id);

    await avisar({
      outcome: printfulResponse.ok ? "cobrada" : "problema",
      orderId: order.id,
      total: paid,
      currency: paidCurrency,
      items: articulos,
      customerName: nombre,
      customerEmail: payer.email_address ?? null,
      address: direccionLegible(direccion),
      printfulOrderId: printfulResponse.ok ? printfulResult.result?.id : null,
      detail: printfulResponse.ok
        ? (esReal ? undefined : "Modo sandbox: el pedido entró como borrador.")
        : `Cobrado, pero Printful no aceptó el pedido: ${
          printfulResult?.error?.message ?? printfulResponse.status
        }. Hay que encargarlo a mano.`,
    });

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
