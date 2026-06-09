import { useState } from 'react';
import { CompactPicker, type ColorResult } from 'react-color';
import { createUser } from '../services/createUser';
import { storeUser } from '../services/userStorage';

export const PICKER_COLORS = [
  '#F44E3B',
  '#FF6B6B',
  '#FE9200',
  '#FF8C42',
  '#FCDC00',
  '#FFE66D',
  '#DBDF00',
  '#A4DD00',
  '#2ECC71',
  '#68CCCA',
  '#4ECDC4',
  '#73D8FF',
  '#45B7D1',
  '#AEA1FF',
  '#9B59B6',
  '#FDA1FF',
  '#FF69B4',
  '#D33115',
  '#E27300',
  '#FCC400',
  '#B0BC00',
  '#68BC00',
  '#96CEB4',
  '#16A5A5',
  '#009CE0',
  '#7B64FF',
  '#FA28FF',
  '#9F0500',
  '#C45100',
  '#FB9E00',
  '#194D33',
  '#0C797D',
  '#0062B1',
  '#653294',
  '#AB149E',
  '#3498DB',
  '#F39C12',
];

type SignUpFormProps = {
  visible: boolean;
  color: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
  onSuccess: () => void;
};

function SignUpForm({
  visible,
  color,
  onColorChange,
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
        <div className="signup-form__picker">
          <CompactPicker
            color={color}
            colors={PICKER_COLORS}
            onChange={(result: ColorResult) => onColorChange(result.hex)}
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
