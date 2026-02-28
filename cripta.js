document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('criptaGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const supabaseClient = window.supabaseClient;

    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-button');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }

    let allBooks = [];

    // Modal elements
    const modalOverlay = document.getElementById('criptaModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalCover = document.getElementById('modalCover');
    const modalTag = document.getElementById('modalTag');
    const modalTitle = document.getElementById('modalTitle');
    const modalAuthor = document.getElementById('modalAuthor');
    const modalDesc = document.getElementById('modalDesc');
    const modalLink = document.getElementById('modalLink');

    async function loadBooks() {
        try {
            const { data, error } = await supabaseClient
                .from('library_books')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);

            if (error) throw error;

            if (data && data.length > 0) {
                // Deduplicate by title just in case API returned similar things across queries
                const uniqueTitles = new Set();
                allBooks = data.filter(book => {
                    if (uniqueTitles.has(book.title.toLowerCase())) return false;
                    uniqueTitles.add(book.title.toLowerCase());
                    return true;
                });

                renderBooks('all');
            } else {
                grid.innerHTML = '<div class="no-books"><p>La Cripta aún está siendo excavada por nuestros eruditos. Regresa pronto.</p></div>';
            }
        } catch (err) {
            console.error("Error fetching library books:", err);
            grid.innerHTML = '<div class="no-books"><p>Error al conectar con los archivos prohibidos.</p></div>';
        }
    }

    function renderBooks(filterValue) {
        grid.style.opacity = '0';

        setTimeout(() => {
            grid.innerHTML = '';

            const filteredData = filterValue === 'all'
                ? allBooks
                : allBooks.filter(b => b.category_tag.toLowerCase() === filterValue.toLowerCase());

            if (filteredData.length === 0) {
                grid.innerHTML = `<div class="no-books"><p>No se encontraron tomos bajo la denominación "${filterValue}".</p></div>`;
            } else {
                filteredData.forEach((book, index) => {
                    const el = document.createElement('div');
                    el.className = 'cripta-book-item';

                    // Stagger intro animation
                    el.style.animation = `fadeInUp 0.5s ease backwards`;
                    el.style.animationDelay = `${index * 0.05}s`;

                    el.innerHTML = `
                        <div class="cripta-book-fallback">
                            <h4>${book.title}</h4>
                            <p>${book.author}</p>
                        </div>
                        <div class="cripta-book-cover" style="background-image: url('${book.cover_url}');"></div>
                    `;

                    el.addEventListener('click', () => openModal(book));
                    grid.appendChild(el);
                });
            }
            grid.style.opacity = '1';
        }, 300);
    }

    function openModal(book) {
        modalCover.src = book.cover_url;
        modalTag.textContent = book.category_tag;
        modalTitle.textContent = book.title;
        modalAuthor.textContent = book.author;
        modalDesc.textContent = book.description;

        // Open Library Link
        modalLink.href = `https://openlibrary.org${book.key}`;

        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderBooks(e.target.getAttribute('data-filter'));
        });
    });

    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Start
    loadBooks();
});
