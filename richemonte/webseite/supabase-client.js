(function () {
  const projectUrl = 'https://hqhseiqtpkrziodgekpc.supabase.co';
  const publishableKey = 'sb_publishable_RmxtEbvhphivp3iYi_Npsw_dgfFRZo8';

  async function request(path, options) {
    const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {})
      }
    });
    if (!response.ok) {
      throw new Error(`Supabase error ${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function normalizeProduct(row) {
    return {
      slug: row.slug,
      number: row.number,
      title: row.title || row.name || 'Produkt',
      name: row.name,
      description: row.description || '',
      price: Number(row.price) || 0,
      discountPrice: row.discount_price == null ? null : Number(row.discount_price),
      currency: row.currency || 'EUR',
      image: row.image,
      alt: row.alt || row.title || row.name,
      material: row.material,
      sizes: Array.isArray(row.sizes) ? row.sizes : [],
      category: row.category,
      detailPage: row.detail_page,
      featured: row.featured === true
    };
  }

  window.RICHEMONTE_SUPABASE = {
    async fetchProducts() {
      try {
        const rows = await request('products?select=*');
        return rows.map(normalizeProduct);
      } catch (error) {
        console.warn('Supabase products unavailable:', error);
        return null;
      }
    },

    async fetchSettings() {
      try {
        const rows = await request('site_settings?select=*');
        const row = rows.find((item) => item.id === 'main') || rows[0];
        if (!row) return null;
        return {
          siteTitle: row.site_title,
          siteSubtitle: row.site_subtitle,
          maintenance: row.maintenance,
          siteContent: row.site_content,
          invoiceDetails: row.invoice_details
        };
      } catch (error) {
        console.warn('Supabase settings unavailable:', error);
        return null;
      }
    },

    async createOrder(payload) {
      const orderId = `RM-${crypto.randomUUID().toUpperCase()}`;
      const items = (payload.items || []).map((item) => ({
        productId: item.productId,
        title: item.title || 'Artikel',
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        selectedSize: item.selectedSize || ''
      }));
      const total = Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
      await request('orders', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          id: orderId,
          items,
          total,
          customer: payload.customer || {},
          notes: payload.notes || '',
          payment_method: 'banktransfer',
          iban: payload.iban || '',
          status: 'offen',
          tracking_number: '',
          created_at: new Date().toISOString()
        })
      });
      return { success: true, orderId };
    },

    async fetchOrderStatus(orderId) {
      const rows = await request('rpc/get_order_status', {
        method: 'POST',
        body: JSON.stringify({ p_order_id: orderId })
      });
      const order = Array.isArray(rows) ? rows[0] : null;
      if (!order) return null;
      return {
        id: order.id,
        total: Number(order.total) || 0,
        status: order.status,
        trackingNumber: order.tracking_number || '',
        createdAt: order.created_at
      };
    }
  };
})();
