import { useLocation, useNavigate } from "react-router-dom";

// Page sections are destinations: Back and Forward must restore them too.
export default function useRouteSection(parameter, defaultValue, values) {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get(parameter);
  const section = values.includes(requested) ? requested : defaultValue;

  const setSection = (nextValue) => {
    const next = typeof nextValue === "function" ? nextValue(section) : nextValue;
    if (!values.includes(next) || next === section) return;
    const params = new URLSearchParams(location.search);
    if (next === defaultValue) params.delete(parameter);
    else params.set(parameter, next);
    const query = params.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : "", hash: location.hash }, {
      state: { ...location.state, preserveSectionScroll: true },
      preventScrollReset: true,
    });
  };

  return [section, setSection];
}
