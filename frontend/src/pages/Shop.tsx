import { useQuery } from '@tanstack/react-query';
import EMenu from '../components/EMenu';
import ProductCard from '../components/ProductCard';
import { fetchProducts } from '../queries/products';

function Shop() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  });

  const products = data ?? [];

  return (
    <>
      {isLoading && <p>Loading products...</p>}
      {!isLoading && isError && (
        <p>Could not load products. Please try again later.</p>
      )}
      {!isLoading && !isError && products.length === 0 && (
        <p>No products available yet.</p>
      )}
      {!isLoading && !isError && products.length > 0 && (
        <section className="product-grid">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </section>
      )}
      <EMenu />
    </>
  );
}

export default Shop;
