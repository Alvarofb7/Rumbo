import { useEffect, useId, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  ClickAwayListener,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import { captureDiagnostic } from '../../lib/diagnostics';
import {
  createPlaceSearchSession,
  resetPlaceSearchSession,
  resolveLocationSuggestion,
  searchLocation,
} from '../../lib/googlePlaces';

export function getNextActiveIndex(currentIndex, optionCount, direction) {
  if (!optionCount) return -1;
  if (direction === 'down') return currentIndex < optionCount - 1 ? currentIndex + 1 : 0;
  return currentIndex > 0 ? currentIndex - 1 : optionCount - 1;
}

export function getSearchOptionId(listboxId, result, index) {
  const key = result.id || `${result.name}-${result.lat}-${result.lng}` || index;
  return `${listboxId}-option-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export default function MapSearch({ bias, onMenuOpen, onSelect, syncMeta }) {
  const generatedId = useId().replaceAll(':', '');
  const listboxId = `map-search-${generatedId}`;
  const inputRef = useRef(null);
  const sessionRef = useRef(createPlaceSearchSession());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setActiveIndex(-1);
      return undefined;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) {
      setResults([]);
      setError('');
      setLoading(false);
      setActiveIndex(-1);
      return undefined;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const nextResults = await searchLocation(trimmedQuery, {
          ...bias,
          session: sessionRef.current,
          allowTextSearch: true,
        });
        if (!ignore) {
          setResults(nextResults);
          setActiveIndex(-1);
          if (!nextResults.length) setError('No he encontrado esa ubicación.');
        }
      } catch (searchError) {
        if (!ignore) {
          captureDiagnostic('search.main.suggestions', searchError);
          setResults([]);
          setActiveIndex(-1);
          setError(searchError.message);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 350);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [bias, open, query]);

  async function selectResult(result) {
    setLoading(true);
    setError('');
    try {
      const resolved = await resolveLocationSuggestion(result, sessionRef.current);
      setQuery(resolved.name || resolved.address || '');
      setResults([]);
      setActiveIndex(-1);
      setOpen(false);
      await onSelect(resolved);
    } catch (resolveError) {
      captureDiagnostic('search.main.resolve', resolveError);
      setError(resolveError.message);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function submitSearch() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    if (trimmedQuery.length < 3) {
      setOpen(true);
      setError('Escribe al menos 3 caracteres.');
      return;
    }

    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const nextResults = await searchLocation(trimmedQuery, {
        ...bias,
        session: sessionRef.current,
        allowTextSearch: true,
      });
      setResults(nextResults);
      setActiveIndex(-1);
      if (!nextResults.length) setError('No he encontrado esa ubicación.');
    } catch (searchError) {
      captureDiagnostic('search.main.submit', searchError);
      setResults([]);
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    resetPlaceSearchSession(sessionRef.current);
    setQuery('');
    setResults([]);
    setError('');
    setLoading(false);
    setActiveIndex(-1);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => getNextActiveIndex(current, results.length, event.key === 'ArrowDown' ? 'down' : 'up'));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) void selectResult(results[activeIndex]);
      else void submitSearch();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    }
  }

  const showPanel = open && (query.trim().length > 0 || loading || error);
  const activeOptionId = activeIndex >= 0 && results[activeIndex]
    ? getSearchOptionId(listboxId, results[activeIndex], activeIndex)
    : undefined;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ maxWidth: 680, mx: 'auto', position: 'relative', pointerEvents: 'auto' }}>
        <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, height: 58, px: 0.65, borderRadius: '18px', bgcolor: 'rgba(255,255,255,0.92)', border: '1px solid rgba(8,75,67,0.10)', boxShadow: '0 18px 48px rgba(6,42,48,0.16)', backdropFilter: 'blur(22px)' }}>
          <Tooltip title="Menú">
            <IconButton aria-label="Abrir menú" onClick={onMenuOpen}>
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <Box component="form" onSubmit={(event) => { event.preventDefault(); void submitSearch(); }} sx={{ flex: 1, minWidth: 0, height: 46, px: 1, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: 0.9, bgcolor: open ? 'rgba(8,75,67,0.06)' : 'transparent', transition: 'background-color 160ms ease' }}>
            <SearchIcon fontSize="small" color="action" />
            <InputBase
              inputRef={inputRef}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar en el mapa"
              inputProps={{
                'aria-label': 'Buscar en el mapa',
                role: 'combobox',
                'aria-expanded': showPanel,
                'aria-controls': listboxId,
                'aria-autocomplete': 'list',
                'aria-activedescendant': activeOptionId,
              }}
              sx={{ flex: 1, minWidth: 0, '& input': { p: 0, fontWeight: 850, fontSize: 16, color: 'text.primary' }, '& input::placeholder': { opacity: 1, color: 'text.secondary' } }}
            />
            {loading ? <CircularProgress size={18} /> : query && (
              <IconButton type="button" aria-label="Limpiar búsqueda" size="small" onClick={clearSearch}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Tooltip title={syncMeta.label}>
            <Box role="status" aria-label={syncMeta.label} sx={{ width: 8, height: 8, mr: 1.2, borderRadius: 99, bgcolor: syncMeta.color }} />
          </Tooltip>
        </Paper>

        {showPanel && (
          <Paper id={listboxId} role="listbox" aria-label="Resultados de búsqueda" elevation={0} sx={{ mt: 1, maxHeight: { xs: 310, sm: 360 }, overflow: 'auto', borderRadius: '16px', bgcolor: 'rgba(255,255,255,0.97)', border: '1px solid rgba(8,75,67,0.10)', boxShadow: '0 24px 60px rgba(6,42,48,0.18)', backdropFilter: 'blur(22px)' }}>
            {query.trim().length < 3 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.6 }}>Escribe al menos 3 caracteres para buscar.</Typography>
            ) : error ? (
              <Typography role="status" variant="body2" color="text.secondary" sx={{ px: 2, py: 1.6 }}>{error}</Typography>
            ) : (
              <List dense disablePadding>
                {results.map((result, index) => {
                  const optionId = getSearchOptionId(listboxId, result, index);
                  return (
                    <ListItemButton
                      id={optionId}
                      role="option"
                      aria-selected={activeIndex === index}
                      selected={activeIndex === index}
                      key={optionId}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => void selectResult(result)}
                      sx={{ px: 2, py: 1.15, borderTop: index ? '1px solid rgba(8,75,67,0.08)' : 0 }}
                    >
                      <ListItemText primary={result.name} secondary={result.address} primaryTypographyProps={{ fontWeight: 850, noWrap: true }} secondaryTypographyProps={{ noWrap: true }} />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
}
