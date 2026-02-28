import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Determine the category based on keywords
function categorizeNews(title: string, content: string): string {
  const text = (title + " " + (content || "")).toLowerCase();

  // Keywords defined by the Divina Providentia aesthetic/narrative
  if (text.match(/(geopolitics|war|military|russia|china|us|europe|ukraine|israel|nato|strategy|defense)/)) return 'geopolitics';
  if (text.match(/(tradition|religion|church|catholic|orthodox|liturgy|faith|ancient)/)) return 'tradition';
  if (text.match(/(culture|art|architecture|classic|music|literature|education)/)) return 'culture';
  if (text.match(/(aesthetic|beauty|design|style)/)) return 'aesthetics';

  // Default fallback
  return 'crisis';
}

serve(async (req: Request) => {
  try {
    console.log("Starting fetch-live-news function");

    // 1. Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Admin key to bypass RLS

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch from NewsAPI (NewsData.io)
    // Using the user's provided API key and filtering by politics/world
    const NEWS_API_KEY = Deno.env.get('NEWSDATA_API_KEY') ?? 'pub_fe32b0376cb54b20bcf4652ec6b44aa4'; // Fallback to user provided key

    // Let's get news from reputable English/Spanish sources about politics/world
    const apiUrl = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&category=politics,world&language=es,en`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch news: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return new Response(JSON.stringify({ message: "No news found", count: 0 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3. Process and format articles
    const articlesToInsert = [];

    for (const article of data.results) {
      // Only process items that have essential data
      if (!article.title || !article.link) continue;

      // Format excerpt to be max 280 chars as per design guidelines
      let excerpt = article.description || article.content || "Sin descripción disponible.";
      if (excerpt.length > 280) {
        excerpt = excerpt.substring(0, 277) + "...";
      }

      // Determine our custom "Cultural Impact Level" tag
      const tag = categorizeNews(article.title, excerpt);

      articlesToInsert.push({
        title: article.title,
        excerpt: excerpt,
        source: article.source_name || article.source_id || "Agencia Global",
        url: article.link,
        image_url: article.image_url || null,
        category_tag: tag,
        published_at: article.pubDate || new Date().toISOString()
      });
    }

    // 4. Insert into Supabase (ignoring duplicates via unique URL constraint)
    const { data: insertedData, error } = await supabase
      .from('live_news')
      .upsert(articlesToInsert, { onConflict: 'url', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    let insertedCount = insertedData ? insertedData.length : 0;
    console.log(`Successfully fetched and potentially inserted ${articlesToInsert.length} articles. (${insertedCount} new)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "News fetched and synced successfully",
        totalFetched: articlesToInsert.length,
        newlyInserted: insertedCount
      }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 },
    );
  }
});
