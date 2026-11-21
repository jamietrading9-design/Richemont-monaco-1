(function () {
  const DATA_URL = '/api/products';

  const state = {
    products: [],
    loaded: false,
    loadingPromise: null,
  };

  function normalizeSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    if (Number.isNaN(number)) return String(value);
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(number);
  }

  function buildSlug(product) {
    if (!product) return '';
    return product.slug || normalizeSlug(product.title || product.name || product.id);
  }

  function buildCard(product) {
    const slug = buildSlug(product);
    const title = product.title || product.name || 'Produkt';
    const description = product.shortDescription || product.description || '';
    const image = product.image || product.imageUrl || '';
    const price = formatPrice(product.price);

    const card = document.createElement('article');
    card.className = 'product-card';

    const defaultDetailPage = product.number ? `produkt${String(product.number).padStart(2, '0')}.html` : null;
    const link = document.createElement('a');
    link.className = 'product-card__link';
    link.href = product.detailPage || defaultDetailPage || `product.html?slug=${encodeURIComponent(slug)}`;

    const media = document.createElement('div');
    media.className = 'product-card__media';
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = title;
      img.loading = 'lazy';
      img.decoding = 'async';
      media.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'product-card__placeholder';
      placeholder.textContent = 'Richemonte';
      media.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'product-card__body';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'product-card__eyebrow';
    eyebrow.textContent = product.collection || product.category || 'Collection';

    const heading = document.createElement('h3');
    heading.textContent = title;

    const text = document.createElement('p');
    text.className = 'product-card__description';
    text.textContent = description;

    body.appendChild(eyebrow);
    body.appendChild(heading);
    body.appendChild(text);

    if (price) {
      const priceEl = document.createElement('div');
      priceEl.className = 'product-card__price';
      const discountPrice = product.discountPrice && Number(product.discountPrice);
      if (discountPrice && discountPrice < Number(product.price)) {
        const original = document.createElement('span');
        original.className = 'product-card__price-original';
        original.textContent = formatPrice(product.price);
        original.style.textDecoration = 'line-through';
        original.style.opacity = '0.6';
        original.style.marginRight = '8px';
        priceEl.appendChild(original);

        const sale = document.createElement('span');
        sale.className = 'product-card__price-sale';
        sale.textContent = formatPrice(discountPrice);
        sale.style.color = '#fff';
        priceEl.appendChild(sale);
      } else {
        priceEl.textContent = price;
      }
      body.appendChild(priceEl);
    }

    link.appendChild(media);
    link.appendChild(body);
    card.appendChild(link);

    return card;
  }

  function renderEmpty(container, message) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = message || 'Keine Produkte gefunden.';
    container.appendChild(empty);
  }

  function renderProductList(container, products, options) {
    if (!container) return;

    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = options && options.gridClass ? options.gridClass : container.id === 'showroomList' ? 'showroom-grid' : 'collections-grid';

    if (!products || !products.length) {
      container.appendChild(list);
      renderEmpty(list, 'Keine Produkte verfügbar.');
      return;
    }

    products.forEach((product) => {
      list.appendChild(buildCard(product));
    });

    container.appendChild(list);
  }

  async function fetchProducts() {
    if (state.loaded) return state.products;
    if (state.loadingPromise) return state.loadingPromise;

    // Check localStorage first for instant updates during local development or offline mode
    const localData = localStorage.getItem('richemont_products.json');
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        const products = parsed.products || (Array.isArray(parsed) ? parsed : []);
        if (products.length > 0) {
          state.products = products;
          state.loaded = true;
        }
      } catch (e) {
        console.warn("Could not load products from localStorage", e);
      }
    }

    state.loadingPromise = fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // Handle new API format: { products: [...] }
        let loadedProducts = [];
        if (data && data.products && Array.isArray(data.products)) {
          loadedProducts = data.products;
        } else if (Array.isArray(data)) {
          loadedProducts = data;
        }
        state.products = loadedProducts;
        state.loaded = true;
        return state.products;
      })
      .catch((err) => {
        console.error("Failed fetching products, keeping cached or local products", err);
        // If we loaded from localstorage already, don't clear it
        if (!state.loaded) {
          state.products = [];
          state.loaded = true;
        }
        return state.products;
      });

    return state.loadingPromise;
  }

  function getProductsSync() {
    return state.products.slice();
  }

  function getProductBySlug(slug) {
    const normalized = normalizeSlug(slug);
    return state.products.find((product) => buildSlug(product) === normalized) || null;
  }

  function renderShowroomPage() {
    const title = document.getElementById('showroomTitle');
    const subtitle = document.getElementById('showroomSubtitle');
    const list = document.getElementById('showroomList');

    if (title) title.textContent = title.textContent || 'Exklusive Auswahl';
    if (subtitle) subtitle.textContent = subtitle.textContent || 'Eine datengetriebene Präsentation ausgewählter Produkte.';
    if (!list) return;

    fetchProducts().then((products) => {
      renderProductList(list, products, { gridClass: 'showroom-grid' });
    });
  }

  function renderCollectionsPage() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;

    fetchProducts().then((products) => {
      renderProductList(grid, products, { gridClass: 'collections-grid' });
    });
  }

  function renderProductPage() {
    const root = document.querySelector('[data-product-page]');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (!slug) {
      root.innerHTML = '<div class="empty-state">Kein Produkt ausgewählt.</div>';
      return;
    }

    fetchProducts().then(() => {
      const product = getProductBySlug(slug);
      if (!product) {
        root.innerHTML = '<div class="empty-state">Produkt nicht gefunden.</div>';
        return;
      }

      const title = product.title || product.name || 'Produkt';
      const description = product.description || product.shortDescription || '';
      const image = product.image || product.imageUrl || '';
      const price = formatPrice(product.price);

      root.innerHTML = `
        <article class="product-detail">
          <div class="product-detail__media">${image ? `<img src="${image}" alt="${title}" loading="lazy" decoding="async">` : '<div class="product-detail__placeholder">Richemonte</div>'}</div>
          <div class="product-detail__body">
            <p class="product-detail__eyebrow">${product.collection || product.category || 'Collection'}</p>
            <h1 class="product-detail__title">${title}</h1>
            <p class="product-detail__description">${description}</p>
            ${price ? `<div class="product-detail__price">${price}</div>` : ''}
          </div>
        </article>
      `;
    });
  }

  function boot() {
    const hasShowroom = document.getElementById('showroomList');
    const hasCollections = document.getElementById('collectionsGrid');
    const hasProduct = document.querySelector('[data-product-page]');

    if (hasShowroom) renderShowroomPage();
    if (hasCollections) renderCollectionsPage();
    if (hasProduct) renderProductPage();
  }

  window.RichemonteProducts = {
    fetchProducts,
    getProductsSync,
    getProductBySlug,
    renderShowroomPage,
    renderCollectionsPage,
    renderProductPage,
    renderProductList,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();