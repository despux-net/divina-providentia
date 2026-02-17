// ===================================
// LOOKBOOK CAROUSEL - INFINITE SCROLL
// ===================================

let lookbookImages = [];

async function loadLookbookImages() {
    const { data, error } = await SupabaseAPI.getLookbookImages();

    if (error || !data || data.length === 0) {
        document.getElementById('lookbookCarousel').innerHTML = '<p style="text-align:center;color:#fff;">No hay imágenes disponibles</p>';
        return;
    }

    lookbookImages = data;
    renderInfiniteCarousel();
}

function renderInfiniteCarousel() {
    const container = document.getElementById('lookbookCarousel');

    // Duplicate images for infinite loop effect
    const duplicatedImages = [...lookbookImages, ...lookbookImages];

    const slidesHTML = duplicatedImages.map((img, index) => `
    <div class="carousel-slide">
      <img src="${img.image_url}" 
           alt="Lookbook ${(index % lookbookImages.length) + 1}"
           loading="lazy">
    </div>
  `).join('');

    container.innerHTML = `
    <div class="carousel-track">
      ${slidesHTML}
    </div>
  `;

    // Add parallax effect on mouse move
    const track = container.querySelector('.carousel-track');
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentX = x / rect.width;
        const moveX = (percentX - 0.5) * 50; // Move up to 50px in either direction
        track.style.transform = `translateX(calc(-50% + ${moveX}px))`;
    });

    container.addEventListener('mouseleave', () => {
        track.style.transform = '';
    });
}

// Initialize carousel on page load
document.addEventListener('DOMContentLoaded', () => {
    loadLookbookImages();
});
