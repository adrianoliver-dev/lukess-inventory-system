export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string | null;
          email: string;
          full_name: string;
          role: "admin" | "manager" | "staff";
          avatar_url: string | null;
          is_active: boolean;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          location_id?: string | null;
          email: string;
          full_name: string;
          role?: "admin" | "manager" | "staff";
          avatar_url?: string | null;
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          location_id?: string | null;
          email?: string;
          full_name?: string;
          role?: "admin" | "manager" | "staff";
          avatar_url?: string | null;
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      access_requests: {
        Row: {
          id: string;
          organization_id: string | null;
          email: string;
          full_name: string;
          phone: string | null;
          message: string | null;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          email: string;
          full_name: string;
          phone?: string | null;
          message?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          email?: string;
          full_name?: string;
          phone?: string | null;
          message?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          category_id: string | null;
          sku: string;
          sku_group: string | null;
          name: string;
          description: string | null;
          price: number;
          cost: number;
          brand: string | null;
          color: string | null;
          sizes: string[];
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          category_id?: string | null;
          sku: string;
          sku_group?: string | null;
          name: string;
          description?: string | null;
          price: number;
          cost: number;
          brand?: string | null;
          color?: string | null;
          sizes?: string[];
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          category_id?: string | null;
          sku?: string;
          sku_group?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          cost?: number;
          brand?: string | null;
          color?: string | null;
          sizes?: string[];
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          location_id: string;
          size: string;
          color: string | null;
          quantity: number;
          reserved_qty: number;
          min_stock: number;
          max_stock: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          location_id: string;
          size: string;
          color?: string | null;
          quantity?: number;
          reserved_qty?: number;
          min_stock?: number;
          max_stock?: number | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          location_id?: string;
          size?: string;
          color?: string | null;
          quantity?: number;
          reserved_qty?: number;
          min_stock?: number;
          max_stock?: number | null;
          updated_at?: string;
        };
      };
      inventory_reservations: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          location_id: string;
          size: string | null;
          quantity: number;
          status: "reserved" | "confirmed" | "released" | "completed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          location_id: string;
          size?: string | null;
          quantity: number;
          status?: "reserved" | "confirmed" | "released" | "completed";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          location_id?: string;
          size?: string | null;
          quantity?: number;
          status?: "reserved" | "confirmed" | "released" | "completed";
          created_at?: string;
          updated_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string | null;
          sold_by: string | null;
          customer_name: string | null;
          subtotal: number;
          discount: number;
          tax: number;
          total: number;
          payment_method: "cash" | "qr" | "card";
          notes: string | null;
          canal: "online" | "fisico" | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          location_id?: string | null;
          sold_by?: string | null;
          customer_name?: string | null;
          subtotal: number;
          discount?: number;
          tax?: number;
          total: number;
          payment_method: "cash" | "qr" | "card";
          notes?: string | null;
          canal?: "online" | "fisico" | null;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          location_id?: string | null;
          sold_by?: string | null;
          customer_name?: string | null;
          subtotal?: number;
          discount?: number;
          tax?: number;
          total?: number;
          payment_method?: "cash" | "qr" | "card";
          notes?: string | null;
          canal?: "online" | "fisico" | null;
          order_id?: string | null;
          created_at?: string;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          location_id: string | null;
          size: string | null;
          color: string | null;
          quantity: number;
          unit_price: number;
          subtotal: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          location_id?: string | null;
          size?: string | null;
          color?: string | null;
          quantity: number;
          unit_price: number;
          subtotal: number;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          location_id?: string | null;
          size?: string | null;
          color?: string | null;
          quantity?: number;
          unit_price?: number;
          subtotal?: number;
        };
      };
      orders: {
        Row: {
          id: string;
          organization_id: string | null;
          customer_name: string;
          customer_phone: string;
          customer_email: string | null;
          subtotal: number;
          discount: number;
          total: number;
          status: "pending" | "pending_payment" | "reserved" | "confirmed" | "shipped" | "completed" | "cancelled";
          payment_method: string;
          payment_proof: string | null;
          notes: string | null;
          internal_notes: string | null;
          managed_by: string | null;
          canal: "online" | "fisico" | null;
          fulfillment_location_id: string | null;
          fulfillment_notes: string | null;
          reserved_at: string | null;
          expires_at: string | null;
          payment_receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          customer_name: string;
          customer_phone: string;
          customer_email?: string | null;
          subtotal: number;
          discount?: number;
          total: number;
          status?: "pending" | "pending_payment" | "reserved" | "confirmed" | "shipped" | "completed" | "cancelled";
          payment_method?: string;
          payment_proof?: string | null;
          notes?: string | null;
          internal_notes?: string | null;
          managed_by?: string | null;
          canal?: "online" | "fisico" | null;
          fulfillment_location_id?: string | null;
          fulfillment_notes?: string | null;
          reserved_at?: string | null;
          expires_at?: string | null;
          payment_receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string | null;
          subtotal?: number;
          discount?: number;
          total?: number;
          status?: "pending" | "pending_payment" | "reserved" | "confirmed" | "shipped" | "completed" | "cancelled";
          payment_method?: string;
          payment_proof?: string | null;
          notes?: string | null;
          internal_notes?: string | null;
          managed_by?: string | null;
          canal?: "online" | "fisico" | null;
          fulfillment_location_id?: string | null;
          fulfillment_notes?: string | null;
          reserved_at?: string | null;
          expires_at?: string | null;
          payment_receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          size: string | null;
          color: string | null;
          subtotal: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          size?: string | null;
          color?: string | null;
          subtotal: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          size?: string | null;
          color?: string | null;
          subtotal?: number;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: "admin" | "manager" | "staff";
      payment_method: "cash" | "qr" | "card";
    };
  };
};

// ─── Helper Types ────────────────────────────────────────────────────────────

/** Tipo base para filas de cada tabla */
type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Tipo para insertar en cada tabla */
type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Tipo para actualizar en cada tabla */
type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// ─── Exported Row Types ──────────────────────────────────────────────────────

export type Organization = Tables<"organizations">;
export type Location = Tables<"locations">;
export type Profile = Tables<"profiles">;
export type AccessRequest = Tables<"access_requests">;
export type Category = Tables<"categories">;
export type Product = Tables<"products">;
export type Inventory = Tables<"inventory">;
export type InventoryReservation = Tables<"inventory_reservations">;
export type Sale = Tables<"sales">;
export type SaleItem = Tables<"sale_items">;

// ─── Exported Insert Types ───────────────────────────────────────────────────

export type ProductInsert = TablesInsert<"products">;
export type InventoryInsert = TablesInsert<"inventory">;
export type SaleInsert = TablesInsert<"sales">;
export type SaleItemInsert = TablesInsert<"sale_items">;

// ─── Exported Update Types ───────────────────────────────────────────────────

export type ProductUpdate = TablesUpdate<"products">;
export type InventoryUpdate = TablesUpdate<"inventory">;

// ─── Composite / Extended Types ──────────────────────────────────────────────

/** Producto con su inventario en todas las ubicaciones */
export type ProductWithInventory = Product & {
  inventory: Inventory[];
  category?: Category | null;
};

/** Producto con inventario de una ubicación específica */
export type ProductWithLocationStock = Product & {
  inventory: Inventory;
  category?: Category | null;
};

/** Venta con sus ítems y datos del vendedor */
export type SaleWithItems = Sale & {
  sale_items: (SaleItem & {
    product: Product;
  })[];
  profile?: Profile;
  location?: Location;
};

/** Perfil con datos de ubicación y organización */
export type ProfileWithDetails = Profile & {
  organization: Organization;
  location?: Location | null;
};

// ─── Enum Types ──────────────────────────────────────────────────────────────

export type UserRole = Database["public"]["Enums"]["user_role"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "pending_payment"
  | "reserved"
  | "confirmed"
  | "shipped"
  | "completed"
  | "cancelled";

export type Order = Tables<"orders"> & {
  discount_amount?: number | null;
  discount_code_id?: string | null;
  discount_percent?: number | null;
  shipping_cost?: number | null;
  // Delivery fields (not yet in generated types but exist in DB)
  delivery_method?: string | null;
  shipping_address?: string | null;
  shipping_reference?: string | null;
  pickup_location?: string | null;
  maps_link?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_instructions?: string | null;
  discount_consumed?: boolean | null;
};
export type OrderItem = Tables<"order_items">;
export type OrderInsert = TablesInsert<"orders">;
export type OrderUpdate = TablesUpdate<"orders">;
export type OrderItemInsert = TablesInsert<"order_items">;

/** Orden con sus ítems y datos de producto */
export type OrderWithItems = Order & {
  order_items: (OrderItem & {
    product?: Product;
  })[];
};

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
  }
> = {
  pending: {
    label: "Pendiente",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    icon: "🕐",
  },
  pending_payment: {
    label: "Pago pendiente",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: "💳",
  },
  reserved: {
    label: "Pago pendiente",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: "💳",
  },
  confirmed: {
    label: "Pago confirmado",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "✅",
  },
  shipped: {
    label: "En camino",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: "🚚",
  },
  completed: {
    label: "Entregado",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "🎉",
  },
  cancelled: {
    label: "Cancelado",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "❌",
  },
};
