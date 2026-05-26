import type { Product } from '../queries/products';
import {
  buildSanityImageSrcSet,
  optimizeSanityImage,
} from '../sanityIntegration';

const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51TbNgb2LlkiYyOVlcfBAfROJ19lnZPlVCHSNkaA1FRfSIB3TRRGBDuLv17EpLjYl8pe8bgAel6oomNxK1uQyiJkz00hwKMpHYy';

const PRODUCT_IMAGE_WIDTH = 480;

type ProductCardProps = {
  product: Product;
};

function ProductCard({ product }: ProductCardProps) {
  const aspectRatio = product.imageDimensions?.aspectRatio ?? 1;
  const renderedHeight = Math.round(PRODUCT_IMAGE_WIDTH / aspectRatio);
  const imageOptions = { width: PRODUCT_IMAGE_WIDTH };

  return (
    <article className="product-card">
      {product.imageUrl && (
        <img
          src={optimizeSanityImage(product.imageUrl, imageOptions)}
          srcSet={buildSanityImageSrcSet(product.imageUrl, imageOptions)}
          width={PRODUCT_IMAGE_WIDTH}
          height={renderedHeight}
          loading="lazy"
          alt={product.title}
          className="product-image"
        />
      )}
      <div className="product-meta">
        <h2 className="product-title">{product.title}</h2>
        {typeof product.price === 'number' && (
          <p className="product-price">${product.price.toFixed(2)}</p>
        )}
      </div>
      {product.description && (
        <p className="product-description">{product.description}</p>
      )}
      {product.stripeBuyButtonId ? (
        <div className="product-buy">
          <span className="product-buy-icon" aria-hidden="true">
            +
          </span>
          <stripe-buy-button
            buy-button-id={product.stripeBuyButtonId}
            publishable-key={STRIPE_PUBLISHABLE_KEY}
          />
        </div>
      ) : (
        <p className="product-unavailable">
          Product payment options currently unavailable.
        </p>
      )}
    </article>
  );
}

export default ProductCard;
