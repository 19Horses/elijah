type CardProps = {
  onClick?: () => void;
  disabled?: boolean;
};

function Card({ onClick, disabled = false }: CardProps) {
  return (
    <button
      type="button"
      className="splash-card"
      onClick={onClick}
      disabled={disabled}
      aria-label="Get started"
    >
      <span className="splash-card__letter" aria-hidden="true">
        E
      </span>
    </button>
  );
}

export default Card;
