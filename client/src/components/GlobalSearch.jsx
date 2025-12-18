import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const searchRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut to focus search (Ctrl/Cmd + K)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSearch = async (searchQuery) => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setLoading(true)
    try {
      const data = await api.get(`/search/quick?q=${encodeURIComponent(searchQuery)}`)
      setResults(data.results || [])
      setShowDropdown(true)
      setSelectedIndex(-1)
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setQuery(value)

    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      handleSearch(value)
    }, 300)
  }

  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === 'Enter' && query.trim().length >= 2) {
        navigate(`/search?q=${encodeURIComponent(query)}`)
        setShowDropdown(false)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleResultClick(results[selectedIndex])
        } else if (query.trim().length >= 2) {
          navigate(`/search?q=${encodeURIComponent(query)}`)
          setShowDropdown(false)
        }
        break
      case 'Escape':
        setShowDropdown(false)
        inputRef.current?.blur()
        break
    }
  }

  const handleResultClick = (result) => {
    navigate(`/cases/${result.id}`)
    setShowDropdown(false)
    setQuery('')
    setResults([])
  }

  const handleViewAllResults = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`)
    setShowDropdown(false)
  }

  return (
    <div className="global-search" ref={searchRef}>
      <div className="search-input-wrapper">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && results.length > 0 && setShowDropdown(true)}
          placeholder="Search cases... (Ctrl+K)"
          className="search-input"
        />
        {loading && <span className="search-spinner"></span>}
      </div>

      {showDropdown && (
        <div className="search-dropdown">
          {results.length > 0 ? (
            <>
              <div className="search-results">
                {results.map((result, index) => (
                  <div
                    key={result.id}
                    className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => handleResultClick(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="result-main">
                      <span className="result-case-number">{result.case_number}</span>
                      {result.category_code && (
                        <span className="result-category">{result.category_code}</span>
                      )}
                      <span className={`result-status ${result.resolution_status === 'Open' ? 'open' : 'closed'}`}>
                        {result.resolution_status}
                      </span>
                    </div>
                    <div className="result-secondary">
                      <span className="result-defendant">{result.defendant_name}</span>
                      {result.case_name && (
                        <span className="result-name"> - {result.case_name}</span>
                      )}
                    </div>
                    <div className="result-stage">
                      {result.current_stage}
                    </div>
                  </div>
                ))}
              </div>
              <div className="search-footer" onClick={handleViewAllResults}>
                <span>View all results for "{query}"</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
              </div>
            </>
          ) : (
            <div className="search-no-results">
              {loading ? 'Searching...' : 'No cases found'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
