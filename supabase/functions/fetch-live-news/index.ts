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

// Determine the continent based on country names or keywords
function determineContinent(countryArray: string[] | null, textContent: string): string {
  if (countryArray && countryArray.length > 0) {
    // NewsData.io usually returns full country names in English
    const countryStr = countryArray.join(" ").toLowerCase();

    // Extensive mapping for full country names
    if (countryStr.match(/(united kingdom|france|germany|italy|spain|russia|ukraine|poland|sweden|norway|finland|netherlands|belgium|switzerland|austria|greece|portugal|ireland|denmark|hungary|romania|bulgaria|serbia|croatia|europe|eu)/)) return 'europe';
    if (countryStr.match(/(united states|america|canada|mexico|argentina|brazil|chile|colombia|peru|venezuela|cuba|ecuador|bolivia|paraguay|uruguay|panama|costa rica|honduras|guatemala|el salvador|nicaragua|dominican|puerto rico|jamaica|haiti)/)) return 'america';
    if (countryStr.match(/(china|japan|india|korea|indonesia|pakistan|bangladesh|philippines|vietnam|turkey|iran|thailand|myanmar|iraq|afghanistan|saudi arabia|uzbekistan|malaysia|yemen|nepal|sri lanka|kazakhstan|syria|cambodia|jordan|azerbaijan|uae|united arab emirates|tajikistan|israel|lebanon|kyrgyzstan|turkmenistan|singapore|oman|kuwait|georgia|mongolia|armenia|qatar|bahrain|asia|taiwan)/)) return 'asia';
    if (countryStr.match(/(nigeria|ethiopia|egypt|congo|tanzania|south africa|kenya|uganda|algeria|sudan|morocco|angola|mozambique|ghana|madagascar|cameroon|cote d'ivoire|niger|burkina faso|mali|malawi|zambia|senegal|chad|somalia|zimbabwe|guinea|rwanda|benin|burundi|tunisia|south sudan|togo|sierra leone|libya|africa)/)) return 'africa';
    if (countryStr.match(/(australia|papua new guinea|new zealand|fiji|solomon islands|vanuatu|samoa|kiribati|tonga|micronesia|palau|marshall islands|tuvalu|nauru|oceania)/)) return 'oceania';
  }

  // Fallback to keyword matching if no country code or code not found
  const text = textContent.toLowerCase();

  if (text.match(/(eeuu|estados unidos|america|washington|biden|trump|new york|california|texas|mexico|colombia|argentina|brasil|chile|peru|venezuela|canada|latinoamerica|sudamerica|norteamerica)/)) return 'america';
  if (text.match(/(europa|europe|reinounido|uk|london|paris|france|germany|berlin|spain|madrid|italy|rome|russia|moscow|ukraine|kiev|putin|zelensky|otan|nato|union europea)/)) return 'europe';
  if (text.match(/(asia|china|beijing|japan|tokyo|india|new delhi|pakistan|iran|israel|jerusalem|gaza|middle east|oriente medio|corea|seoul|taiwan|xi jinping|netanyahu|hamas|hezbollah|arabia|emiratos)/)) return 'asia';
  if (text.match(/(africa|sudafrica|nigeria|egypt|cairo|kenya|congo|sahel|mali|burkina|sudan)/)) return 'africa';
  if (text.match(/(australia|sydney|oceania|new zealand)/)) return 'oceania';

  return 'world'; // Default to global if undetermined
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
    const apiUrl = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&category=politics,world&language=es,en&size=50`;

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

      // Determine the continent
      const continent = determineContinent(article.country, article.title + " " + excerpt);

      articlesToInsert.push({
        title: article.title,
        excerpt: excerpt,
        source: article.source_name || article.source_id || "Agencia Global",
        url: article.link,
        image_url: article.image_url || null,
        category_tag: tag,
        continent: continent,
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
