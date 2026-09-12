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

// PayPal tiene dos mundos separados. El secreto PAYPAL_ENV decide cuál:
// "sandbox" para ensayar sin mover dinero, cualquier otra cosa (o nada)
// para el real.
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

    if (!body.items?.length) {
      throw new Error("El carrito está vacío");
    }

    const { data: settings } = await supabase
      .from("site_settings")
      .select("paypal_payment, paypal_client_id")
      .eq("id", 1)
      .maybeSingle();

    if (settings?.paypal_payment !== true) {
      throw new Error("El cobro con PayPal está apagado");
    }

    // Los precios se leen de la base, nunca del navegador. Es la misma
    // regla que en Stripe: lo que diga el cliente no decide qué se cobra.
    const lineItems: Array<{
      productName: string;
      size: string;
      quantity: number;
      priceCents: number;
      currency: string;
      productId: number;
      printfulSyncVariantId: number;
    }> = [];

    for (const item of body.items) {
      const { data: variant, error } = await supabase
        .from("product_printful_variants")
        .select("printful_sync_variant_id, price_cents, currency, products(id, name, published, available)")
        .eq("product_id", item.productId)
        .eq("size", item.size)
        .single();

      if (error || !variant) {
        throw new Error(
          `El producto ${item.productId} (talla ${item.size}) no está disponible para compra automática`,
        );
      }

      const product = (variant as any).products;
      if (!product?.published || !product?.available) {
        throw new Error(`El producto "${product?.name ?? item.productId}" no está disponible`);
      }

      lineItems.push({
        productId: item.productId,
        productName: product.name,
        size: item.size,
        quantity: Math.max(1, Math.floor(item.quantity || 1)),
        priceCents: variant.price_cents,
        currency: String(variant.currency || "EUR").toUpperCase(),
        printfulSyncVariantId: variant.printful_sync_variant_id,
      });
    }

    const currencies = [...new Set(lineItems.map((li) => li.currency))];
    if (currencies.length > 1) {
      throw new Error("No se puede cobrar un pedido con varias monedas");
    }
    const currency = currencies[0];

    const totalCents = lineItems.reduce((sum, li) => sum + li.priceCents * li.quantity, 0);
    const total = (totalCents / 100).toFixed(2);

    // El pedido se guarda antes de mandar a nadie a pagar, para que el
    // cobro siempre tenga a qué agarrarse cuando vuelva.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        status: "pending",
        total_amount: totalCents / 100,
        currency,
        payment_provider: "paypal",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      throw new Error(`No se pudo crear la orden: ${orderError?.message}`);
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      lineItems.map((li) => ({
        order_id: order.id,
        product_id: li.productId,
        quantity: li.quantity,
        price_at_purchase: li.priceCents / 100,
        size: li.size,
        product_name: li.productName,
        printful_sync_variant_id: li.printfulSyncVariantId,
      })),
    );

    if (itemsError) {
      throw new Error(`No se pudieron guardar los productos de la orden: ${itemsError.message}`);
    }

    // El Client ID es público y vive en los ajustes, editable desde el
    // panel. El secreto solo en el Vault.
    const clientId = settings?.paypal_client_id;
    const [{ data: secret }, { data: env }] = await Promise.all([
      supabase.rpc("get_secret", { secret_name: "PAYPAL_SECRET" }),
      supabase.rpc("get_secret", { secret_name: "PAYPAL_ENV" }),
    ]);

    if (!clientId) {
      throw new Error("Falta el Client ID de PayPal en los ajustes del panel");
    }
    if (!secret) {
      throw new Error("Falta PAYPAL_SECRET en el Vault de Supabase");
    }

    const base = paypalBase(env);
    const token = await paypalToken(base, clientId, secret);

    // GET_FROM_FILE: la dirección de envío la pone PayPal, de la que el
    // comprador tenga guardada. Sin eso no habría a dónde mandar la prenda.
    const paypalResponse = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: String(order.id),
          custom_id: String(order.id),
          description: lineItems.map((li) => `${li.productName} (${li.size})`).join(", ").slice(0, 127),
          amount: {
            currency_code: currency,
            value: total,
            breakdown: { item_total: { currency_code: currency, value: total } },
          },
          items: lineItems.map((li) => ({
            name: `${li.productName} (${li.size})`.slice(0, 127),
            quantity: String(li.quantity),
            unit_amount: { currency_code: currency, value: (li.priceCents / 100).toFixed(2) },
          })),
        }],
        payment_source: {
          paypal: {
            experience_context: {
              shipping_preference: "GET_FROM_FILE",
              user_action: "PAY_NOW",
            },
          },
        },
      }),
    });

    const paypalOrder = await paypalResponse.json().catch(() => ({}));

    if (!paypalResponse.ok || !paypalOrder.id) {
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      throw new Error(
        `PayPal no pudo crear la orden: ${paypalOrder?.message ?? paypalResponse.status}`,
      );
    }

    await supabase
      .from("orders")
      .update({ paypal_order_id: paypalOrder.id })
      .eq("id", order.id);

    return reply({ paypalOrderId: paypalOrder.id, orderId: order.id });
  } catch (error) {
    console.error("paypal-create-order error:", error);
    return reply({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
