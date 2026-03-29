import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Identificador único siguiendo el formato solicitado por ReliefWeb
const APP_NAME = 'DivinaProvidentiaOSINT-Search-V1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const query = body.query;
    const provider = body.provider;

    if (!query || !provider) throw new Error("Se requiere query y provider");

    // Cabeceras extendidas para simular un navegador real y evitar bloqueos de CDNs
    const commonHeaders = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://divinaprovidentia.com/',
        'Origin': 'https://divinaprovidentia.com'
    };

    if (provider === 'gdelt') {
        const targetUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json`;
        const res = await fetch(targetUrl, { headers: commonHeaders });
        if (!res.ok) throw new Error(`GDELT devolvió error HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.articles || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'opensanctions') {
        const res = await fetch(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}&limit=5`, { headers: commonHeaders });
        if (res.status === 401) throw new Error("OpenSanctions requiere un API Key (ApiKey) en las cabeceras para habilitar búsquedas.");
        if (!res.ok) throw new Error(`OpenSanctions devolvió error HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'reliefweb') {
        // ReliefWeb V2 + APP_NAME + Headers de navegación real
        const res = await fetch(`https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(APP_NAME)}&query[value]=${encodeURIComponent(query)}&limit=5`, { 
            headers: commonHeaders 
        });
        if (!res.ok) throw new Error(`ReliefWeb (ONU) devolvió HTTP ${res.status}. El servidor de la ONU está restringiendo la conexión de servidor.`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'acled') {
        const username = Deno.env.get('ACLED_EMAIL') ?? 'despux@gmail.com';
        const password = Deno.env.get('ACLED_PASSWORD') ?? 's_jYNwE7G7kw%P_';
        
        // 1. Obtener Token OAuth
        const authParams = new URLSearchParams();
        authParams.append('username', username);
        authParams.append('password', password);
        authParams.append('grant_type', 'password');
        authParams.append('client_id', 'acled');

        const authRes = await fetch('https://acleddata.com/oauth/token', {
            method: 'POST',
            headers: {
                ...commonHeaders,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: authParams.toString()
        });

        if (!authRes.ok) {
            const err = await authRes.text();
            throw new Error(`Fallo en autenticación ACLED: HTTP ${authRes.status} - ${err}`);
        }

        const authData = await authRes.json();
        const accessToken = authData.access_token;
        if (!accessToken) throw new Error("ACLED no devolvió un access_token.");
        
        // 2. Consulta de datos
        const dataUrl = `https://acleddata.com/api/acled/read?_format=json&limit=5&country=${encodeURIComponent(query)}`;
        const res = await fetch(dataUrl, {
            method: 'GET',
            headers: {
                ...commonHeaders,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!res.ok) {
            const err = await res.text();
            // ACLED suele devolver 403 si la cuenta de usuario no ha sido aprobada manualmente para el uso de la API.
            if (res.status === 403) throw new Error("ACLED denegó el acceso (403). Es probable que tu cuenta de usuario necesite aprobación manual en su plataforma.");
            throw new Error(`HTTP ${res.status} de ACLED: ${err}`);
        }
        
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.data || []);
        
        return new Response(JSON.stringify({ data: items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error("Proveedor no válido");

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
});
