// Supabase Configuration
const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h6bZAJXVXgZpuLYXngprQg_xROEJhhf';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// API Helper Functions
const SupabaseAPI = {
  // Fetch all products
  async getProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching products:', error);
      return { data: null, error };
    }
  },

  // Fetch products by category
  async getProductsByCategory(category) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching products by category:', error);
      return { data: null, error };
    }
  },

  // Create a new order
  async createOrder(orderData) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([orderData])
        .select();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating order:', error);
      return { data: null, error };
    }
  },

  // Get order by ID
  async getOrder(orderId) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching order:', error);
      return { data: null, error };
    }
  }
};

// Export for use in other scripts
window.SupabaseAPI = SupabaseAPI;
