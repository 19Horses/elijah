import { useState } from 'react';
import { CompactPicker, type ColorResult } from 'react-color';
import { PICKER_COLORS } from '../constants/pickerColors';
import { createUser } from '../services/createUser';
import { storeColour } from '../services/userColor';
import { storeUser } from '../services/userStorage';

type SignUpFormProps = {
  visible: boolean;
  color: string;
  onColorChange: (color: string) => void;
  onColorHover?: (color: string) => void;
  onColorHoverEnd?: () => void;
  onClose: () => void;
  onSuccess: () => void;
};

function SignUpForm({
  visible,
  color,
  onColorChange,
  onColorHover,
  onColorHoverEnd,
  onClose,
  onSuccess,
}: SignUpFormProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await createUser({ email, username, colour: color });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      storeColour(color);
      storeUser({
        id: result.id,
        email: result.email,
        username: result.username,
      });
      onSuccess();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className={`signup-form${visible ? ' signup-form--visible' : ''}`}
      onSubmit={handleSubmit}
      aria-hidden={!visible}
    >
      <label className="signup-form__field">
        <span className="signup-form__label">Email</span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError('');
          }}
          required
          tabIndex={visible ? 0 : -1}
        />
      </label>

      <label className="signup-form__field">
        <span className="signup-form__label">Username</span>
        <input
          type="text"
          name="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setError('');
          }}
          required
          tabIndex={visible ? 0 : -1}
        />
      </label>

      <fieldset className="signup-form__field signup-form__color">
        <legend className="signup-form__label">Colour</legend>
        <div
          className="signup-form__picker"
          onMouseLeave={onColorHoverEnd}
        >
          <CompactPicker
            color={color}
            colors={PICKER_COLORS}
            onChange={(result: ColorResult) => onColorChange(result.hex)}
            onSwatchHover={(result: ColorResult) => onColorHover?.(result.hex)}
          />
        </div>
        <input type="hidden" name="color" value={color} required />
      </fieldset>

      {error && <p className="signup-form__error">{error}</p>}

      <div className="signup-form__actions">
        <button
          type="button"
          className="signup-form__action"
          onClick={onClose}
          disabled={isSubmitting}
          tabIndex={visible ? 0 : -1}
        >
          Close
        </button>
        <button
          type="submit"
          className="signup-form__action"
          disabled={isSubmitting}
          tabIndex={visible ? 0 : -1}
        >
          {isSubmitting ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

export default SignUpForm;
