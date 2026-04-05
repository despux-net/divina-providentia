import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Función auxiliar para esperar (delay)
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const query = body.query;
    const provider = body.provider;

    if (!query || !provider) throw new Error("Se requiere query y provider");

    const commonHeaders = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
    };

    // 1. GDELT (Noticias Globales) con Lógica de Reintento
    if (provider === 'gdelt') {
        const targetUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json`;
        
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            const res = await fetch(targetUrl, { headers: commonHeaders });
            
            if (res.status === 429) {
                attempts++;
                if (attempts < maxAttempts) {
                    await delay(2000 * attempts); // Esperar 2s, luego 4s...
                    continue;
                }
                throw new Error("Límite de GDELT alcanzado. Por favor, espera 1 minuto antes de buscar de nuevo.");
            }
            
            if (!res.ok) throw new Error(`GDELT devolvió HTTP ${res.status}`);
            
            const data = await res.json();
            return new Response(JSON.stringify({ data: data.articles || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    throw new Error("Proveedor no válido");

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
});
