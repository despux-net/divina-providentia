import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration for books with Google Drive URLs
// NOTE: Keep these Drive URLs PRIVATE - never expose to client
const BOOKS_CONFIG: Record<string, { driveUrl: string; maxPages: number }> = {
    // Example book - replace with real Google Drive URLs
    "sample-book-1": {
        // ID extracted from: https://drive.google.com/file/d/1ApP6joys40VO2hHZyZbvuvLKp_E64Azt/view?usp=drive_link
        driveUrl: "https://drive.google.com/uc?export=download&id=1ApP6joys40VO2hHZyZbvuvLKp_E64Azt",
        maxPages: 15
    },
    // Add more books here as needed
    // "book-id-2": { driveUrl: "...", maxPages: 15 }
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const bookId = url.searchParams.get('id')

        // Validate book ID
        if (!bookId || !BOOKS_CONFIG[bookId]) {
            return new Response(
                JSON.stringify({ error: 'Book not found' }),
                {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        const book = BOOKS_CONFIG[bookId]

        console.log(`📖 Serving book: ${bookId}`)

        // Fetch PDF from Google Drive
        const driveResponse = await fetch(book.driveUrl)

        if (!driveResponse.ok) {
            console.error(`Failed to fetch from Drive: ${driveResponse.status}`)
            return new Response(
                JSON.stringify({ error: 'Failed to load book from source' }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Get PDF data
        const pdfBuffer = await driveResponse.arrayBuffer()

        // Return PDF with proper headers
        // Note: The 15-page limit will be enforced in the frontend PDF.js viewer
        // This keeps the Edge Function simple and fast
        return new Response(pdfBuffer, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                'X-Max-Pages': book.maxPages.toString() // Send limit to client
            }
        })

    } catch (error) {
        console.error('Error in get-book-preview:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
