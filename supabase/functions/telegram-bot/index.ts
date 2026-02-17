
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = "8281546663:AAGNp5HhbsxHRjY77F5XVqBOIAaqnnwrjco";

Deno.serve(async (req) => {
    try {
        // Create Supabase Client
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Handle Telegram Webhook Update
        if (req.method === "POST") {
            const update = await req.json();

            if (update.message && update.message.text) {
                const chatId = update.message.chat.id;
                const text = update.message.text.trim();

                console.log(`Received command: ${text} from ${chatId}`);

                if (text === "/start" || text === "/status") {
                    // Check Database Health by counting products
                    const { count, error } = await supabase
                        .from('products')
                        .select('*', { count: 'exact', head: true });

                    const dbStatus = error ? "⚠️ ERROR DE CONEXIÓN" : "✅ CONECTADO";
                    const productCount = count !== null ? count : "Desconocido";

                    await sendTelegramMessage(chatId,
                        `⚜️ *DIVINA PROVIDENTIA* ⚜️\n\n` +
                        `Estado del Sistema: *OPERATIVO* 🟢\n` +
                        `Base de Datos: *${dbStatus}*\n` +
                        `Productos en Inventario: *${productCount}*\n\n` +
                        `_Tu presencia mantiene viva la llama._`
                    );
                } else if (text === "/ping") {
                    await sendTelegramMessage(chatId, "PONG! 🏓\n\nEl sistema te escucha.");
                } else {
                    // Optional: Echo or ignore
                    // await sendTelegramMessage(chatId, "Comando desconocido. Intenta /status");
                }
            }

            return new Response("OK", { status: 200 });
        }

        return new Response("Method not allowed", { status: 405 });
    } catch (error) {
        console.error("Error processing request:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
});

async function sendTelegramMessage(chatId: number, text: string) {
    const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: "Markdown"
            })
        }
    );
    const data = await response.json();
    console.log("Telegram response:", data);
    return data;
}
