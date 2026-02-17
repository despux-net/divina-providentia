import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Direct fetch implementation for less dependency issues

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const bookId = url.searchParams.get('id')

        if (!bookId) {
            return new Response(
                JSON.stringify({ error: 'Book ID required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 1. Fetch book metadata from DB using REST API
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        const queryUrl = `${supabaseUrl}/rest/v1/books?id=eq.${bookId}&select=drive_file_id,max_pages_preview`;

        console.log(`Fetching from DB: ${queryUrl}`);

        const dbResponse = await fetch(queryUrl, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!dbResponse.ok) {
            const errorText = await dbResponse.text();
            console.error('DB Error:', errorText);
            return new Response(
                JSON.stringify({ error: 'Database error', details: errorText }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const dbData = await dbResponse.json();
        const book = dbData && dbData.length > 0 ? dbData[0] : null;

        if (!book) {
            console.error('Book not found in DB');
            return new Response(
                JSON.stringify({ error: 'Book not found (REST)', bookId }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const driveId = book.drive_file_id
        const maxPages = book.max_pages_preview || 15;

        console.log(`📖 Serving book: ${bookId} (Drive ID: ${driveId})`)

        // 2. Fetch PDF from Google Drive
        const driveUrl = `https://drive.google.com/uc?export=download&id=${driveId}`
        const driveResponse = await fetch(driveUrl)

        if (!driveResponse.ok) {
            console.error(`Failed to fetch from Drive: ${driveResponse.status}`)
            return new Response(
                JSON.stringify({ error: `Failed to load book from source (Drive: ${driveResponse.status})` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Return PDF
        const pdfBuffer = await driveResponse.arrayBuffer()

        return new Response(pdfBuffer, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=3600',
                'X-Max-Pages': maxPages.toString()
            }
        })

    } catch (error) {
        console.error('Error in get-book-preview:', error)
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
