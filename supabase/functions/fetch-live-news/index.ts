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

  if (text.match(/(eeuu|estados unidos|america|washington|biden|trump|new york|california|texas|mexico|colombia|argentina|brasil|chile|peru|venezuela|canada|latinoamerica|sudamerica|norteamerica|florida|chicago|caracas|bogota|buenos aires|lima|santiago|havana|cuba)/)) return 'america';
  if (text.match(/(europa|europe|reinounido|uk|london|londres|paris|france|francia|germany|alemania|berlin|spain|españa|madrid|italy|italia|rome|roma|russia|rusia|moscow|moscu|ukraine|ucrania|kiev|kyiv|putin|zelensky|otan|nato|union europea|eu|brussels|bruselas|vatican|pope|papa francisco)/)) return 'europe';
  if (text.match(/(asia|china|beijing|pekin|japan|japon|tokyo|india|new delhi|pakistan|iran|israel|jerusalem|jerusalen|gaza|middle east|oriente medio|corea|korea|seoul|seul|taiwan|xi jinping|netanyahu|hamas|hezbollah|arabia|emiratos|dubai|palestina|tehran|tel aviv|lebanon|libano)/)) return 'asia';
  if (text.match(/(africa|sudafrica|nigeria|egypt|egipto|cairo|kenya|congo|sahel|mali|burkina|sudan|marruecos|rabat|argelia|somalia|etiopia|ethiopia)/)) return 'africa';
  if (text.match(/(australia|sydney|oceania|new zealand|nueva zelanda|melbourne)/)) return 'oceania';

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

    // 2. Fetch from NewsAPI.org AND NewsData.io concurrently
    const NEWSDATA_API_KEY = Deno.env.get('NEWSDATA_API_KEY') ?? 'pub_fe32b0376cb54b20bcf4652ec6b44aa4';
    const NEWSORG_API_KEY = Deno.env.get('NEWSAPI_ORG_KEY') ?? '39db7cb32cb44798b8f730747ab308f6';

    const newsDataUrl = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&category=politics,world&language=es,en&size=10`;
    const newsApiOrgUrl = `https://newsapi.org/v2/top-headlines?category=general&language=en&apiKey=${NEWSORG_API_KEY}&pageSize=10`;

    // Fetch both simultaneously
    const [newsDataRes, newsOrgRes] = await Promise.allSettled([
      fetch(newsDataUrl),
      fetch(newsApiOrgUrl)
    ]);

    const articlesToInsert = [];

    // --- Process NewsData.io Results ---
    if (newsDataRes.status === 'fulfilled' && newsDataRes.value.ok) {
      const data1 = await newsDataRes.value.json();
      if (data1.results) {
        for (const article of data1.results) {
          if (!article.title || !article.link) continue;

          let excerpt = article.description || article.content || "Sin descripción disponible.";
          if (excerpt.length > 280) excerpt = excerpt.substring(0, 277) + "...";

          const tag = categorizeNews(article.title, excerpt);
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
      }
    } else {
      console.warn("NewsData API failed:", newsDataRes);
    }

    // --- Process NewsAPI.org Results ---
    if (newsOrgRes.status === 'fulfilled' && newsOrgRes.value.ok) {
      const data2 = await newsOrgRes.value.json();
      if (data2.articles) {
        for (const article of data2.articles) {
          // NewsAPI uses different property names (url instead of link, urlToImage instead of image_url)
          if (!article.title || article.title === '[Removed]' || !article.url) continue;

          let excerpt = article.description || article.content || "Sin descripción disponible.";
          if (excerpt.length > 280) excerpt = excerpt.substring(0, 277) + "...";

          const tag = categorizeNews(article.title, excerpt);

          // NewsAPI.org doesn't provide an array of countries usually, only source.country (sometimes)
          // We rely purely on text matching for the continent
          const continent = determineContinent(null, article.title + " " + excerpt);

          articlesToInsert.push({
            title: article.title,
            excerpt: excerpt,
            source: (article.source && article.source.name) ? article.source.name : "Reportero Global",
            url: article.url,
            image_url: article.urlToImage || null,
            category_tag: tag,
            continent: continent,
            published_at: article.publishedAt || new Date().toISOString()
          });
        }
      }
    } else {
      console.warn("NewsAPI.org failed:", newsOrgRes);
    }

    // 4. Insert into Supabase (ignoring duplicates via unique URL constraint)
    if (articlesToInsert.length === 0) {
      return new Response(JSON.stringify({ message: "No news fetched from any source", count: 0 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: insertedData, error } = await supabase
      .from('live_news')
      .upsert(articlesToInsert, { onConflict: 'url', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    let insertedCount = insertedData ? insertedData.length : 0;
    console.log(`Successfully fetched ${articlesToInsert.length} total articles. (${insertedCount} new saved to DB)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "News fetched and synced successfully",
        totalFetched: articlesToInsert.length,
        newlyInserted: insertedCount
      }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { "Content-Type": "application/json" }, status: 500 },
    );
  }
});
