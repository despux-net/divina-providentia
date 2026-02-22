import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

        // Initialize Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Check Authentication & Validation Status
        let isValidated = false;
        const authHeader = req.headers.get('Authorization');

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (user && !authError) {
                // Check profile validation
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_validated')
                    .eq('id', user.id)
                    .single();

                if (profile && profile.is_validated) {
                    isValidated = true;
                }
                console.log(`User ${user.id} access check: Validated = ${isValidated}`);
            }
        }

        // 2. Fetch book metadata from DB
        const { data: book, error: dbError } = await supabase
            .from('books')
            .select('drive_file_id, max_pages_preview')
            .eq('id', bookId)
            .single();

        if (dbError || !book) {
            console.error('Book not found or DB error:', dbError);
            return new Response(
                JSON.stringify({ error: 'Book not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const driveId = book.drive_file_id;
        // If validated, give full access (e.g. 1000 pages), else use preview limit
        const maxPages = isValidated ? 1000 : (book.max_pages_preview || 15);

        console.log(`📖 Serving book: ${bookId} (Drive ID: ${driveId}). Access: ${isValidated ? 'FULL' : 'PREVIEW'} (${maxPages} pages)`);

        // 3. Fetch PDF from Google Drive
        const driveUrl = `https://drive.google.com/uc?export=download&id=${driveId}`
        const driveResponse = await fetch(driveUrl)

        if (!driveResponse.ok) {
            console.error(`Failed to fetch from Drive: ${driveResponse.status}`)
            return new Response(
                JSON.stringify({ error: `Failed to load book from source (Drive: ${driveResponse.status})` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 4. Return PDF
        const pdfBuffer = await driveResponse.arrayBuffer()

        return new Response(pdfBuffer, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=3600',
                'X-Max-Pages': maxPages.toString(),
                'X-Access-Level': isValidated ? 'full' : 'preview'
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
