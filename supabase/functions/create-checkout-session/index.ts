import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface CartItem {
  productId: number;
  size: string;
  quantity: number;
}

interface CheckoutRequest {
  items: CartItem[];
  // Optional. Checkout collects the buyer's email, name, phone and
  // shipping address itself, so the storefront no longer asks for any of
  // it up front. Anything sent here just pre-fills the page.
  customer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: string;
  };
  // "paypal" restricts the page to PayPal, for the dedicated PayPal
  // button. Anything else (or nothing) shows every method enabled in the
  // Stripe Dashboard, with card first.
  paymentMethod?: string;
  // true asks for a session that renders inside our own page instead of
  // sending the buyer to checkout.stripe.com. Needs the publishable key
  // in the Vault; without it we quietly fall back to the hosted page.
  embedded?: boolean;
}

// Countries Divina Providentia currently ships to. Add/remove as needed.
const ALLOWED_SHIPPING_COUNTRIES = [
  "DE", "AT", "CH", "FR", "ES", "IT", "NL", "BE", "PT", "LU", "PL",
  "GB", "US", "CA", "MX", "CO", "VE", "AR", "CL",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (req.method !== "POST") {
      throw new Error("Method not allowed");
    }

    const body: CheckoutRequest = await req.json();

    if (!body.items?.length) {
      throw new Error("El carrito está vacío");
    }

    // Look up authoritative prices + Printful variant IDs server-side.
    // Never trust a price sent by the browser.
    const lineItems: Array<{
      productId: number;
      productName: string;
      size: string;
      quantity: number;
      priceCents: number;
      currency: string;
      printfulSyncVariantId: number;
      image: string | null;
    }> = [];

    for (const item of body.items) {
      const { data: variant, error: variantError } = await supabase
        .from("product_printful_variants")
        .select("printful_sync_variant_id, price_cents, currency, products(id, name, published, available, images)")
        .eq("product_id", item.productId)
        .eq("size", item.size)
        .single();

      if (variantError || !variant) {
        throw new Error(
          `El producto ${item.productId} (talla ${item.size}) no está disponible para compra automática`,
        );
      }

      const product = (variant as any).products;
      if (!product?.published || !product?.available) {
        throw new Error(`El producto "${product?.name ?? item.productId}" no está disponible`);
      }

      // Checkout only accepts absolute URLs, and only the first image.
      const firstImage = Array.isArray(product.images)
        ? product.images.find((src: unknown) =>
          typeof src === "string" && /^https:\/\//i.test(src))
        : null;

      lineItems.push({
        productId: item.productId,
        productName: product.name,
        size: item.size,
        quantity: Math.max(1, Math.floor(item.quantity || 1)),
        priceCents: variant.price_cents,
        currency: (variant.currency || "EUR").toLowerCase(),
        printfulSyncVariantId: variant.printful_sync_variant_id,
        image: firstImage ?? null,
      });
    }

    const totalAmount = lineItems.reduce(
      (sum, li) => sum + (li.priceCents * li.quantity) / 100,
      0,
    );

    // One order, one currency. The variant rows are the source of truth,
    // and the storefront refuses to mix fulfilment types in a single cart,
    // so every line here already agrees.
    const currencies = [...new Set(lineItems.map((li) => li.currency))];
    if (currencies.length > 1) {
      throw new Error("No se puede cobrar un pedido con varias monedas");
    }
    const orderCurrency = currencies[0].toUpperCase();

    // 1. Create the order (awaiting payment) so we have an id to attach to
    // Stripe. Uses the same 'pending' status your admin panel already knows
    // about. The buyer's details stay empty until the webhook copies them
    // over from the completed Checkout session.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        status: "pending",
        total_amount: totalAmount,
        customer_name: body.customer?.name ?? null,
        customer_surname: body.customer?.surname ?? null,
        customer_email: body.customer?.email ?? null,
        customer_phone: body.customer?.phone ?? null,
        payment_provider: "stripe",
        currency: orderCurrency,
      })
      .select()
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

    // 2. Get the Stripe secret key from Vault (never hardcoded).
    const { data: stripeKey, error: secretError } = await supabase.rpc("get_secret", {
      secret_name: "STRIPE_SECRET_KEY",
    });

    if (secretError || !stripeKey) {
      throw new Error(
        "Falta configurar STRIPE_SECRET_KEY en el Vault de Supabase",
      );
    }

    // Pública por definición: viaja al navegador para arrancar Stripe.js.
    // Si no está guardada, el pago embebido no puede montarse y se sirve
    // la pasarela de siempre.
    const { data: publishableKey } = await supabase.rpc("get_secret", {
      secret_name: "STRIPE_PUBLISHABLE_KEY",
    });

    const embedded = body.embedded === true && !!publishableKey;

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://divinaprovidentia.com";

    // 3. Create the Stripe Checkout Session via the REST API (form-encoded,
    // built manually because Stripe expects repeated bracketed keys for
    // arrays). Checkout is what collects the email, the name, the phone and
    // the shipping address -- asking for them again on our own page would
    // just be the same form twice.
    const returnUrl = `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;

    const formParts: string[] = [
      "mode=payment",
      `client_reference_id=${encodeURIComponent(String(order.id))}`,
      `metadata[order_id]=${encodeURIComponent(String(order.id))}`,
      "phone_number_collection[enabled]=true",
    ];

    if (embedded) {
      // Embebida: la pasarela se dibuja dentro de divinaprovidentia.com.
      // Aquí no hay cancel_url; cancelar es cerrar la ventanita, y de eso
      // se encarga el navegador.
      formParts.push("ui_mode=embedded_page");
      formParts.push(`return_url=${encodeURIComponent(returnUrl)}`);
    } else {
      formParts.push(`success_url=${encodeURIComponent(returnUrl)}`);
      formParts.push(`cancel_url=${encodeURIComponent(`${siteUrl}/?checkout=cancel`)}`);
    }

    if (body.customer?.email) {
      formParts.push(`customer_email=${encodeURIComponent(body.customer.email)}`);
    }

    // Only the PayPal button narrows the page down. Left alone, Checkout
    // shows every method enabled in the Dashboard, card first -- taking
    // any of them away here would quietly disable what you turned on.
    if (body.paymentMethod === "paypal") {
      formParts.push("payment_method_types[]=paypal");
    }

    for (const country of ALLOWED_SHIPPING_COUNTRIES) {
      formParts.push(`shipping_address_collection[allowed_countries][]=${country}`);
    }

    lineItems.forEach((li, idx) => {
      formParts.push(`line_items[${idx}][quantity]=${li.quantity}`);
      formParts.push(`line_items[${idx}][price_data][currency]=${li.currency}`);
      formParts.push(`line_items[${idx}][price_data][unit_amount]=${li.priceCents}`);
      formParts.push(
        `line_items[${idx}][price_data][product_data][name]=${encodeURIComponent(`${li.productName} (${li.size})`)}`,
      );
      if (li.image) {
        formParts.push(
          `line_items[${idx}][price_data][product_data][images][]=${encodeURIComponent(li.image)}`,
        );
      }
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formParts.join("&"),
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      throw new Error(`Stripe error: ${session?.error?.message ?? "desconocido"}`);
    }

    await supabase
      .from("orders")
      .update({ payment_reference: session.id })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        mode: embedded ? "embedded" : "hosted",
        url: session.url ?? null,
        clientSecret: session.client_secret ?? null,
        publishableKey: embedded ? publishableKey : null,
        orderId: order.id,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-checkout-session error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
