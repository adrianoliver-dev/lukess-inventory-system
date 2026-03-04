import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getDefaultOrgId } from "@/lib/auth";
import EditProductForm from "./edit-product-form";
import type { Category, Location } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  const orgId = (profile.organization_id ?? await getDefaultOrgId()) as string | null;
  if (!orgId) redirect("/login");

  // Get product with inventory
  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      *,
      categories(id, name),
      inventory(
        id,
        quantity,
        min_stock,
        location_id,
        size,
        color,
        locations(id, name)
      )
    `
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error || !product) {
    redirect("/inventario");
  }

  // Get categories
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  // Get locations
  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  // Get brands
  const { data: brandsData } = await supabase
    .from("products")
    .select("brand")
    .eq("organization_id", orgId)
    .not("brand", "is", null);

  const uniqueBrands = Array.from(new Set(brandsData?.map(p => p.brand).filter(Boolean) as string[])).sort();

  return (
    <EditProductForm
      product={product}
      categories={(categories as Category[]) || []}
      locations={(locations as Location[]) || []}
      organizationId={orgId}
      brands={uniqueBrands}
    />
  );
}
