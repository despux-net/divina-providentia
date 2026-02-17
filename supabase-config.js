// Supabase Configuration
const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const k1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0';
const k2 = '.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U';
const SUPABASE_ANON_KEY = k1 + k2;

// Initialize Supabase client (renamed to avoid conflict with CDN global)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// API Helper Functions
const SupabaseAPI = {
  // Fetch all products
  async getProducts() {
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to match expected format (image -> image_url)
      const transformedData = data.map(product => ({
        ...product,
        image_url: product.image ? `${SUPABASE_URL}/storage/v1/object/public/products/${product.image}` : null
      }));

      return { data: transformedData, error: null };
    } catch (error) {
      console.error('Error fetching products:', error);
      return { data: null, error };
    }
  },

  // Fetch products by category
  async getProductsByCategory(category) {
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('category', category)
        .eq('published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to match expected format
      const transformedData = data.map(product => ({
        ...product,
        image_url: product.image ? `${SUPABASE_URL}/storage/v1/object/public/products/${product.image}` : null
      }));

      return { data: transformedData, error: null };
    } catch (error) {
      console.error('Error fetching products by category:', error);
      return { data: null, error };
    }
  },

  // Create a new order (simplified for guest checkout)
  async createOrder(orderData) {
    try {
      // Create order without user_id (guest checkout)
      const orderRecord = {
        total_amount: orderData.total,
        status: orderData.status || 'pending',
        user_id: null // Guest checkout
      };

      const { data: order, error: orderError } = await supabaseClient
        .from('orders')
        .insert([orderRecord])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = orderData.items.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        price_at_purchase: item.price
      }));

      const { error: itemsError } = await supabaseClient
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Store customer info in localStorage for now
      // (In production, you'd want to create a customers table)
      localStorage.setItem(`order_${order.id}_customer`, JSON.stringify({
        name: orderData.customer_name,
        email: orderData.customer_email,
        phone: orderData.customer_phone
      }));

      return { data: [order], error: null };
    } catch (error) {
      console.error('Error creating order:', error);
      return { data: null, error };
    }
  },

  // Get order by ID
  async getOrder(orderId) {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (*)
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching order:', error);
      return { data: null, error };
    }
  },

  // Upload product image to Supabase Storage
  async uploadProductImage(file, productId) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabaseClient.storage
        .from('products')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Update product with image path
      const { error: updateError } = await supabaseClient
        .from('products')
        .update({ image: fileName })
        .eq('id', productId);

      if (updateError) throw updateError;

      return {
        data: {
          path: filePath,
          url: `${SUPABASE_URL}/storage/v1/object/public/products/${fileName}`
        },
        error: null
      };
    } catch (error) {
      console.error('Error uploading image:', error);
      return { data: null, error };
    }
  },

  // Get lookbook carousel images
  async getLookbookImages() {
    try {
      const { data, error } = await supabaseClient
        .from('lookbook_images')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching lookbook:', error);
      return { data: null, error };
    }
  }
};

// Export for use in other scripts
window.SupabaseAPI = SupabaseAPI;
window.supabaseClient = supabaseClient;
