import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getDefaultOrgId } from "@/lib/auth";
import NewProductForm from "./new-product-form";

export default async function NuevoProductoPage() {
  const supabase = await createClient();

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  const orgId = (profile.organization_id ?? await getDefaultOrgId()) as string | null;
  if (!orgId) redirect("/login");

  const [categoriesResult, locationsResult, productCountResult, brandsResult] =
    await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("locations")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("products")
        .select("brand")
        .eq("organization_id", orgId)
        .not("brand", "is", null),
    ]);

  const uniqueBrands = Array.from(new Set(brandsResult.data?.map(p => p.brand).filter(Boolean) as string[])).sort();

  return (
    <NewProductForm
      categories={categoriesResult.data || []}
      locations={locationsResult.data || []}
      organizationId={orgId}
      nextProductNumber={(productCountResult.count || 0) + 1}
      brands={uniqueBrands}
    />
  );
}
