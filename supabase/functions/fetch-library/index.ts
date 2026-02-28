import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const QUERIES = [
  "geopolitics",
  "stoicism",
  "roman empire",
  "military strategy",
  "theology",
  "classic literature",
  "political philosophy"
];

serve(async (req: Request) => {
  try {
    console.log("Starting fetch-library function");

    // 1. Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Admin key

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Select a random query to keep the library dynamic
    const randomQuery = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const randomPage = Math.floor(Math.random() * 5) + 1; // Get pages 1 to 5 randomly to vary results
    const apiUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(randomQuery)}&limit=50&page=${randomPage}`;

    console.log(`Fetching books for query: ${randomQuery} (Page ${randomPage})`);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch from Open Library: ${response.status}`);
    }

    const data = await response.json();

    if (!data.docs || data.docs.length === 0) {
      return new Response(JSON.stringify({ message: "No books found", query: randomQuery }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3. Process the docs concurrently to fetch descriptions
    const validDocs = data.docs.filter((doc: any) => doc.title && doc.author_name && doc.cover_i && doc.key).slice(0, 25);

    console.log(`Found ${validDocs.length} valid docs with covers. Fetching details...`);

    const booksToInsert = await Promise.all(
      validDocs.map(async (doc: any) => {
        const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        const author = Array.isArray(doc.author_name) ? doc.author_name[0] : doc.author_name;

        let description = "";

        try {
          // Fetch the actual work description
          const workRes = await fetch(`https://openlibrary.org${doc.key}.json`);
          if (workRes.ok) {
            const workData = await workRes.json();
            if (workData.description) {
              description = typeof workData.description === 'string'
                ? workData.description
                : workData.description.value || "";
            }

            // If still no description after fetching workData, try to build it from subjects
            if (!description && doc.subject && Array.isArray(doc.subject) && doc.subject.length > 0) {
              description = `Este archivo trata sobre: ${doc.subject.slice(0, 8).join(', ')}.`;
            }
          }
        } catch (err) {
          console.error(`Error fetching description for ${doc.key}:`, err);
          if (doc.subject && Array.isArray(doc.subject) && doc.subject.length > 0) {
            description = `Tópicos: ${doc.subject.slice(0, 5).join(', ')}.`;
          }
        }

        // If Open Library has NO text details at all, we reject the book from entering the Cripta
        if (!description || description.trim() === "") {
          return null;
        }

        return {
          key: doc.key, // unique identifier from Open Library (e.g., "/works/OL123W")
          title: doc.title,
          author: author,
          cover_url: coverUrl,
          description: description,
          category_tag: randomQuery
        };
      })
    );

    const validBooksToInsert = booksToInsert.filter(Boolean);

    // 4. Insert into Supabase
    if (validBooksToInsert.length === 0) {
      return new Response(JSON.stringify({ message: "No suitable books with covers found", query: randomQuery }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: insertedData, error } = await supabase
      .from('library_books')
      .upsert(validBooksToInsert, { onConflict: 'key', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    const insertedCount = insertedData ? insertedData.length : 0;
    console.log(`Successfully fetched ${validBooksToInsert.length} books. (${insertedCount} new saved to DB)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Books fetched and synced successfully",
        query: randomQuery,
        totalFetched: validBooksToInsert.length,
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
