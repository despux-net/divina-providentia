import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Estos valores estaban escritos aquí dentro y el sitio publicaba este
// archivo, así que cualquiera podía leerlos. Ahora salen del almacén de
// secretos de Supabase:
//   npx supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

interface OrderData {
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
        const orderData: OrderData = await req.json();

        // Format the message for Telegram
        const message = `
🛍️ *NUEVO PEDIDO - Divina Providentia*

👤 *Cliente:*
${orderData.customerName}

📱 *Teléfono:*
${orderData.customerPhone}

💬 *Mensaje:*
${orderData.customerMessage || "Sin mensaje"}

📦 *Productos:*
${orderData.items.map(item =>
            `• ${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`
        ).join('\n')}

💰 *Total: $${orderData.total.toFixed(2)}*

---
_Pedido recibido desde la tienda web_
    `.trim();

        // Send message to Telegram
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
                    parse_mode: "Markdown",
                }),
            }
        );

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            throw new Error(`Telegram API error: ${telegramData.description}`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Pedido enviado exitosamente",
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    } catch (error) {
        console.error("Error sending Telegram message:", error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
});
