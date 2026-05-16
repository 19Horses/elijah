import { Test, useGetTests } from '../queries/useGetTests';

function Home() {
  const { loading, error, data } = useGetTests();
  console.log(data);
  if (loading) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>Error!</p>;
  }

  return data.tests.map((test: Test) => {
    return <p key={test.title}>{test.title}</p>;
  });
}

export default Home;
