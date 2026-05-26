import type { Product } from '../queries/products';

const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51TbNgb2LlkiYyOVlcfBAfROJ19lnZPlVCHSNkaA1FRfSIB3TRRGBDuLv17EpLjYl8pe8bgAel6oomNxK1uQyiJkz00hwKMpHYy';

type ProductCardProps = {
  product: Product;
};

function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="product-card">
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.title}
          className="product-image"
        />
      )}
      <h2 className="product-title">{product.title}</h2>
      {typeof product.price === 'number' && (
        <p className="product-price">${product.price.toFixed(2)}</p>
      )}
      {product.description && (
        <p className="product-description">{product.description}</p>
      )}
      {product.stripeBuyButtonId ? (
        <stripe-buy-button
          buy-button-id={product.stripeBuyButtonId}
          publishable-key={STRIPE_PUBLISHABLE_KEY}
        />
      ) : (
        <p className="product-unavailable">
          Product payment options currently unavailable.
        </p>
      )}
    </article>
  );
}

export default ProductCard;
