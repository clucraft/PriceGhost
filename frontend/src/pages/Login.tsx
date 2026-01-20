import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    navigate('/');
  };

  return <AuthForm mode="login" onSubmit={handleLogin} />;
}
