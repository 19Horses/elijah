/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'stripe-buy-button': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        'buy-button-id'?: string;
        'publishable-key'?: string;
      },
      HTMLElement
    >;
  }
}
