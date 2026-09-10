import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Estos valores estaban escritos aquí dentro y el sitio publicaba este
// archivo, así que cualquiera podía leerlos. Ahora salen del almacén de
// secretos de Supabase:
//   npx supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

interface OrderData {
    type?: "order";
    customerName: string;
    customerPhone: string;
    customerMessage: string;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    total: number;
}

interface ContactData {
    type: "contact";
    name: string;
    email: string;
    message: string;
}

type Payload = OrderData | ContactData;

// Todo lo que escribe el visitante pasa por aquí antes de entrar en el
// mensaje. Sin esto, un nombre con < o & rompe el analizador de Telegram
// y el aviso no llega nunca.
function esc(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function buildOrderMessage(d: OrderData): string {
    const lines = (d.items ?? []).map((item) =>
        `• ${esc(item.name)} x${item.quantity} — $${(item.price * item.quantity).toFixed(2)}`
    ).join("\n");

    return [
        "🛍️ <b>NUEVO PEDIDO — Divina Providentia</b>",
        "",
        `👤 <b>Cliente:</b> ${esc(d.customerName)}`,
        `📱 <b>Contacto:</b> ${esc(d.customerPhone)}`,
        `💬 <b>Mensaje:</b> ${esc(d.customerMessage) || "Sin mensaje"}`,
        "",
        "📦 <b>Productos:</b>",
        lines || "—",
        "",
        `💰 <b>Total: $${Number(d.total ?? 0).toFixed(2)}</b>`,
    ].join("\n");
}

function buildContactMessage(d: ContactData): string {
    return [
        "✉️ <b>NUEVO MENSAJE — Divina Providentia</b>",
        "",
        `👤 <b>Nombre:</b> ${esc(d.name)}`,
        `📧 <b>Email:</b> ${esc(d.email)}`,
        "",
        "💬 <b>Mensaje:</b>",
        esc(d.message),
        "",
        "<i>Enviado desde el formulario del pie de página</i>",
    ].join("\n");
}

Deno.serve(async (req: Request) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    try {
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            throw new Error(
                "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en los secretos de la función.",
            );
        }

        const payload: Payload = await req.json();

        // Sin 'type' se asume pedido, que es como llamaba la web hasta
        // ahora: así los pedidos siguen funcionando aunque no se
        // actualice el resto.
        const message = payload.type === "contact"
            ? buildContactMessage(payload)
            : buildOrderMessage(payload as OrderData);

        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            },
        );

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            throw new Error(`Telegram API error: ${telegramData.description}`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Aviso enviado correctamente",
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    } catch (error) {
        console.error("Error sending Telegram message:", error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    }
});
