const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const k1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0';
const k2 = '.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U';
const SUPABASE_ANON_KEY = k1 + k2;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
    console.log('--- Testing DB Access ---');

    // 1. List all books
    const { data: allBooks, error: listError } = await supabase.from('books').select('*');

    if (listError) {
        console.error('List Error:', listError);
    } else {
        console.log(`Found ${allBooks.length} books.`);
        allBooks.forEach(b => {
            console.log(` - [${b.id}] ${b.title} (DriveID: ${b.drive_file_id})`);
        });
    }

    // 2. Fetch specific book
    const targetId = '93f26c9d-dd25-426a-a4d0-3db175026960';
    console.log(`\n--- Fetching Target Book: ${targetId} ---`);
    const { data: book, error: singleError } = await supabase.from('books').select('*').eq('id', targetId).single();

    if (singleError) {
        console.error('Fetch Error:', singleError);
    } else {
        console.log(`Success! Found book: ${book.title}`);
        console.log(`Drive ID: ${book.drive_file_id}`);
    }
}

test();
