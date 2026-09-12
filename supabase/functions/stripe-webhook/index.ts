import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const signature = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    const [{ data: stripeKey }, { data: webhookSecret }, { data: printfulKey }] = await Promise.all([
      supabase.rpc("get_secret", { secret_name: "STRIPE_SECRET_KEY" }),
      supabase.rpc("get_secret", { secret_name: "STRIPE_WEBHOOK_SECRET" }),
      supabase.rpc("get_secret", { secret_name: "PRINTFUL_API_KEY" }),
    ]);

    if (!stripeKey || !webhookSecret || !printfulKey) {
      throw new Error("Faltan secretos (Stripe/Printful) en el Vault");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature ?? "",
        webhookSecret,
      );
    } catch (err) {
      console.error("Firma de Stripe inválida:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, ignored: event.type }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.client_reference_id ?? session.metadata?.order_id;

    if (!orderId) {
      throw new Error("La sesión de Stripe no tiene order_id asociado");
    }

    const { data: order, error: orderFetchError } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();

    if (orderFetchError || !order) {
      throw new Error(`No se encontró la orden ${orderId}: ${orderFetchError?.message}`);
    }

    // Idempotency: Stripe may deliver the same event more than once.
    if (order.printful_order_id) {
      return new Response(JSON.stringify({ received: true, already_processed: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const shippingDetails = (session as any).shipping_details ?? (session as any).collected_information?.shipping_details;
    const shippingAddress = shippingDetails?.address ?? session.customer_details?.address;

    // The storefront no longer asks the buyer for anything: Checkout is
    // where the name, email, phone and address are typed, so the session
    // is the source of truth and the order row is only a fallback for
    // sessions created before that change.
    const recipientName = shippingDetails?.name ?? session.customer_details?.name ?? order.customer_name;
    const buyerEmail = session.customer_details?.email ?? order.customer_email ?? null;
    const buyerPhone = session.customer_details?.phone ?? order.customer_phone ?? null;

    if (!shippingAddress?.line1 || !shippingAddress?.country) {
      throw new Error("No se recibió dirección de envío en la sesión de Stripe");
    }

    // Only ever auto-submit to Printful production on a REAL payment.
    // Test-mode payments create a draft order you must confirm by hand in
    // the Printful dashboard, so testing never triggers a real print run.
    const shouldConfirm = event.livemode === true;

    const printfulPayload = {
      recipient: {
        name: recipientName,
        address1: shippingAddress.line1,
        address2: shippingAddress.line2 ?? undefined,
        city: shippingAddress.city,
        state_code: shippingAddress.state ?? undefined,
        country_code: shippingAddress.country,
        zip: shippingAddress.postal_code,
        email: buyerEmail ?? undefined,
        phone: buyerPhone ?? undefined,
      },
      items: order.order_items.map((oi: any) => ({
        sync_variant_id: oi.printful_sync_variant_id,
        quantity: oi.quantity,
      })),
      confirm: shouldConfirm,
    };

    const printfulResponse = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${printfulKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(printfulPayload),
    });

    const printfulResult = await printfulResponse.json();

    // The order IS paid regardless of what happens next, so it always moves
    // to 'processing' (same status your admin panel already uses). If
    // Printful fails, printful_order_id stays null so you can spot it and
    // create/confirm the order by hand -- check the function logs for why.
    const updatePayload: Record<string, unknown> = {
      status: "processing",
      payment_reference: session.payment_intent as string,
      livemode: event.livemode,
      shipping_address: { name: recipientName, ...shippingAddress },
      customer_name: recipientName,
      customer_email: buyerEmail,
      customer_phone: buyerPhone,
    };

    if (printfulResponse.ok) {
      updatePayload.printful_order_id = printfulResult.result.id;
    } else {
      console.error("Printful error:", JSON.stringify(printfulResult));
    }

    await supabase.from("orders").update(updatePayload).eq("id", orderId);

    if (!printfulResponse.ok) {
      throw new Error(`Printful error: ${JSON.stringify(printfulResult?.error ?? printfulResult)}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stripe-webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
