import { useQuery } from '@tanstack/react-query';
import ProductCard from '../components/ProductCard';
import { fetchProducts } from '../queries/products';

function Shop() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  });

  if (isLoading) {
    return <p>Loading products...</p>;
  }

  if (isError) {
    return <p>Could not load products. Please try again later.</p>;
  }

  const products = data ?? [];

  if (products.length === 0) {
    return <p>No products available yet.</p>;
  }

  return (
    <section className="product-grid">
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </section>
  );
}

export default Shop;
