import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

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

    if (provider === 'gdelt') {
        const targetUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json`;
        const res = await fetch(targetUrl, { headers: commonHeaders });
        if (!res.ok) throw new Error(`GDELT devolvió error HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.articles || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'opensanctions') {
        const res = await fetch(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}&limit=5`, { headers: commonHeaders });
        if (!res.ok) throw new Error(`OpenSanctions devolvió error HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'reliefweb') {
        const res = await fetch(`https://api.reliefweb.int/v1/reports?appname=osint_search&query[value]=${encodeURIComponent(query)}&limit=5`, { headers: commonHeaders });
        if (!res.ok) throw new Error(`ReliefWeb devolvió error HTTP ${res.status}`);
        const data = await res.json();
        return new Response(JSON.stringify({ data: data.data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (provider === 'acled') {
        const username = Deno.env.get('ACLED_EMAIL') ?? 'despux@gmail.com';
        const password = Deno.env.get('ACLED_PASSWORD') ?? 's_jYNwE7G7kw%P_';
        
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
        
        const dataUrl = `https://api.acleddata.com/acled/read?_format=json&limit=5&country=${encodeURIComponent(query)}`;
        const res = await fetch(dataUrl, {
            method: 'GET',
            headers: {
                ...commonHeaders,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!res.ok) {
            const err = await res.text();
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
