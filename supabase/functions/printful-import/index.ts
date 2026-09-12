import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// Talla que usan la tienda y el panel cuando un artículo no se vende por
// tallas. Tiene que coincidir con SINGLE_SIZE del navegador.
const SINGLE_SIZE = "ÚNICA";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function printful(path: string, key: string) {
  const response = await fetch(`https://api.printful.com${path}`, {
    headers: { "Authorization": `Bearer ${key}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Printful respondió ${response.status}: ${payload?.error?.message ?? "sin detalle"}`,
    );
  }
  return payload.result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Esto escribe en el catálogo, así que solo entra el dueño. La sesión
    // la manda el panel; se comprueba contra is_admin(), que es la misma
    // regla que protege el resto de la base.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: isAdmin } = await caller.rpc("is_admin");
    if (isAdmin !== true) {
      return reply({ error: "Hay que entrar como administrador para importar de Printful." }, 403);
    }

    const { data: key } = await admin.rpc("get_secret", { secret_name: "PRINTFUL_API_KEY" });
    if (!key) {
      throw new Error("Falta PRINTFUL_API_KEY en el Vault de Supabase");
    }

    const body = await req.json().catch(() => ({}));

    // -----------------------------------------------------------------
    // Qué hay en la tienda de Printful, y qué está ya enlazado aquí
    // -----------------------------------------------------------------
    if (body.action === "list") {
      const catalogue = await printful("/store/products?limit=100", key);

      const { data: linked } = await admin
        .from("product_printful_variants")
        .select("product_id, printful_sync_product_id");

      const linkedTo = new Map<string, number>();
      for (const row of linked ?? []) {
        linkedTo.set(String(row.printful_sync_product_id), row.product_id);
      }

      const ids = [...new Set((linked ?? []).map((r) => r.product_id))];
      const { data: products } = ids.length
        ? await admin.from("products").select("id, name, published").in("id", ids)
        : { data: [] };

      const byId = new Map((products ?? []).map((p) => [p.id, p]));

      return reply({
        products: (catalogue ?? []).map((p: any) => {
          const productId = linkedTo.get(String(p.id)) ?? null;
          const local = productId ? byId.get(productId) : null;
          return {
            syncProductId: p.id,
            name: p.name,
            thumbnail: p.thumbnail_url ?? null,
            variants: p.variants ?? 0,
            synced: p.synced ?? 0,
            productId,
            localName: local?.name ?? null,
            published: local?.published ?? null,
          };
        }),
      });
    }

    // -----------------------------------------------------------------
    // Traer un producto de Printful al catálogo
    // -----------------------------------------------------------------
    if (body.action === "import") {
      const syncProductId = Number(body.syncProductId);
      if (!Number.isFinite(syncProductId) || syncProductId <= 0) {
        throw new Error("No se ha indicado qué producto de Printful importar");
      }

      const detail = await printful(`/store/products/${syncProductId}`, key);
      const syncProduct = detail?.sync_product;
      const allVariants: any[] = detail?.sync_variants ?? [];

      if (!syncProduct || !allVariants.length) {
        throw new Error("Ese producto de Printful no tiene variantes sincronizadas");
      }

      // Una fila por talla. Si el producto tiene varios colores, la misma
      // talla aparece repetida: la tienda todavía no sabe vender colores
      // bajo demanda, así que se queda la primera y se avisa de cuáles
      // han quedado fuera.
      const bySize = new Map<string, any>();
      const skipped: string[] = [];

      for (const variant of allVariants) {
        const size = variant.size || SINGLE_SIZE;
        if (bySize.has(size)) {
          skipped.push(variant.name ?? `variante ${variant.id}`);
          continue;
        }
        bySize.set(size, variant);
      }

      const variants = [...bySize.values()];
      const sizes = [...bySize.keys()];

      const currencies = [
        ...new Set(variants.map((v) => String(v.currency || "EUR").toUpperCase())),
      ];
      if (currencies.length > 1) {
        throw new Error(
          "Ese producto tiene precios en varias monedas en Printful. Déjalo en una sola y vuelve a importarlo.",
        );
      }
      const currency = currencies[0];

      const prices = variants.map((v) => Number(v.retail_price));
      if (prices.some((p) => !Number.isFinite(p) || p <= 0)) {
        throw new Error(
          "Alguna talla no tiene precio de venta en Printful. Ponlo allí y vuelve a importar.",
        );
      }
      const price = Math.min(...prices);

      // Los mockups de cada talla, sin repetir, y detrás la foto de
      // catálogo de la prenda para que se vea el corte.
      const images: string[] = [];
      for (const variant of variants) {
        for (const file of variant.files ?? []) {
          if (file?.type === "preview" && file.preview_url && !images.includes(file.preview_url)) {
            images.push(file.preview_url);
          }
        }
      }
      const catalogueImage = variants[0]?.product?.image;
      if (catalogueImage && !images.includes(catalogueImage)) {
        images.push(catalogueImage);
      }

      const { data: existing } = await admin
        .from("product_printful_variants")
        .select("product_id")
        .eq("printful_sync_product_id", syncProductId)
        .limit(1)
        .maybeSingle();

      let productId: number | null = existing?.product_id ?? null;
      const created = productId === null;

      if (created) {
        // Entra como borrador: el nombre, la descripción y las fotos son
        // cosa suya, y es mejor que lo revise antes de que salga a la web.
        const { data: inserted, error } = await admin
          .from("products")
          .insert({
            name: syncProduct.name,
            price,
            currency,
            sizes,
            images,
            category: typeof body.category === "string" && body.category ? body.category : "vestments",
            fulfillment: "printful",
            available: true,
            published: false,
            stock_by_size: {},
          })
          .select("id")
          .single();

        if (error || !inserted) {
          throw new Error(`No se pudo crear el producto: ${error?.message}`);
        }
        productId = inserted.id;
      } else {
        // Al reimportar solo se refresca lo que manda Printful. El nombre,
        // la descripción y si está publicado son suyos y no se tocan; las
        // fotos tampoco, salvo que lo pida expresamente.
        const patch: Record<string, unknown> = {
          price,
          currency,
          sizes,
          fulfillment: "printful",
          updated_at: new Date().toISOString(),
        };
        if (body.replaceImages === true) patch.images = images;

        const { error } = await admin.from("products").update(patch).eq("id", productId);
        if (error) throw new Error(`No se pudo actualizar el producto: ${error.message}`);
      }

      // El mapeo de tallas se rehace entero: es un reflejo de Printful, no
      // algo que se edite a mano, y así desaparecen las tallas retiradas.
      await admin.from("product_printful_variants").delete().eq("product_id", productId);

      const { error: variantError } = await admin.from("product_printful_variants").insert(
        variants.map((variant) => ({
          product_id: productId,
          size: variant.size || SINGLE_SIZE,
          printful_sync_variant_id: variant.id,
          printful_sync_product_id: syncProductId,
          price_cents: Math.round(Number(variant.retail_price) * 100),
          currency,
        })),
      );

      if (variantError) {
        throw new Error(`No se pudieron guardar las tallas: ${variantError.message}`);
      }

      return reply({
        productId,
        created,
        name: syncProduct.name,
        price,
        currency,
        sizes,
        images: images.length,
        skipped,
      });
    }

    throw new Error("Acción no reconocida");
  } catch (error) {
    console.error("printful-import error:", error);
    return reply({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
