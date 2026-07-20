import { useState } from 'react';
import { createUser } from '../services/createUser';
import {
  findUserByEmail,
  type ExistingUser,
} from '../services/findUserByEmail';
import { applySelectionColour, storeColour } from '../services/userColor';
import { storeUser } from '../services/userStorage';

type SignUpFormProps = {
  visible: boolean;
  color: string;
  onClose: () => void;
  onSuccess: () => void;
};

function SignUpForm({ visible, color, onClose, onSuccess }: SignUpFormProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once we've looked up the entered email and found a matching account, so
  // returning users skip the username step and just log back in.
  const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  // The email string the existingUser result belongs to, so we don't re-check
  // an unchanged value or act on a stale lookup.
  const [checkedEmail, setCheckedEmail] = useState('');

  const checkEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed || trimmed === checkedEmail) {
      return;
    }
    // Only bother once it looks like a complete address.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return;
    }

    setIsCheckingEmail(true);
    try {
      const match = await findUserByEmail(trimmed);
      setExistingUser(match);
      setCheckedEmail(trimmed);
    } catch {
      // Ignore lookup errors and fall back to the normal sign-up flow.
      setExistingUser(null);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Returning user: log straight in with their stored account and colour.
      if (existingUser) {
        storeColour(existingUser.colour);
        applySelectionColour(existingUser.colour);
        storeUser({
          id: existingUser.id,
          email: existingUser.email,
          username: existingUser.username,
        });
        onSuccess();
        return;
      }

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
            // Editing the email invalidates any prior lookup.
            setExistingUser(null);
            setCheckedEmail('');
          }}
          onBlur={checkEmail}
          required
          tabIndex={visible ? 0 : -1}
        />
      </label>

      {existingUser ? (
        <p className="signup-form__welcome">
          Welcome back, {existingUser.username}.
        </p>
      ) : (
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
      )}

      <input type="hidden" name="color" value={color} />

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
          disabled={isSubmitting || isCheckingEmail}
          tabIndex={visible ? 0 : -1}
        >
          {isSubmitting
            ? 'Saving…'
            : isCheckingEmail
            ? 'Checking…'
            : existingUser
            ? 'Log in'
            : 'Continue'}
        </button>
      </div>
    </form>
  );
}

export default SignUpForm;
