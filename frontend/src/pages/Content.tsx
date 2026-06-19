import { useParams } from 'react-router-dom';

function Content() {
  const { slug } = useParams();

  return (
    <section className="content-page">
      <p>hello</p>
      {slug ? <p className="content-page__slug">{slug}</p> : null}
    </section>
  );
}

export default Content;
