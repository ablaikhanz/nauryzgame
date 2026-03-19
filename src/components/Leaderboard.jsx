import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getAllResults, getResultsByDate, getUniqueDates } from '../utils/db';

const Leaderboard = ({ onNewParticipant }) => {
  const { t } = useLanguage();
  const [results, setResults] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [revealedPhones, setRevealedPhones] = useState({});

  const loadData = async () => {
    setIsLoading(true);
    try {
      const uniqueDates = await getUniqueDates();
      setDates(uniqueDates);

      let data;
      if (selectedDate === 'all') {
        data = await getAllResults();
      } else {
        data = await getResultsByDate(selectedDate);
      }
      // Sort by score descending
      data.sort((a, b) => b.score - a.score);
      setResults(data);
    } catch (err) {
      console.error('Error loading results:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  useEffect(() => {
    setRevealedPhones({});
  }, [selectedDate, results.length]);

  const getRankClass = (idx) => {
    if (idx === 0) return 'first';
    if (idx === 1) return 'second';
    if (idx === 2) return 'third';
    return 'other';
  };

  const getRankEmoji = (idx) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}м ${s}с` : `${s}с`;
  };

  const formatDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const formatAstanaDateTime = (result) => {
    if (result.dateTime) return result.dateTime;
    if (!result.timestamp) return '—';

    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Almaty',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(result.timestamp)).replace(',', '');
  };

  const handlePrint = () => {
    window.print();
  };

  const togglePhoneReveal = (id) => {
    setRevealedPhones((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getFinishText = (result) => {
    return result.finishReason?.trim() || t('completionNormal');
  }

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h2 className="leaderboard-title">{t('leaderboardTitle')}</h2>
        <div className="leaderboard-actions">
          <button onClick={handlePrint} className="btn-action" title={t('printPdfHint')}>
            {t('printPdfBtn')}
          </button>
          <button onClick={onNewParticipant} className="btn-action btn-action-primary">
            {t('newParticipantBtn')}
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="date-filter">
        <button
          className={`date-btn ${selectedDate === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedDate('all')}
        >
          {t('allDays')}
        </button>
        {dates.map((d) => (
          <button
            key={d}
            className={`date-btn ${selectedDate === d ? 'active' : ''}`}
            onClick={() => setSelectedDate(d)}
          >
            {formatDate(d)}
          </button>
        ))}
      </div>

      {/* Results Table */}
      {isLoading ? (
        <div className="loading-text">{t('loading')}</div>
      ) : results.length === 0 ? (
        <p className="empty-text">{t('noResultsText')}</p>
      ) : (
        <div className="results-table" id="printable-leaderboard">
          <div className="print-header">
            <h1>{t('title')}</h1>
            <p>{t('leaderboardHeader')} {selectedDate !== 'all' ? `${t('leaderboardFor')} ${formatDate(selectedDate)}` : t('leaderboardAll')}</p>
          </div>
          <div className="table-header">
            <span className="col-rank">{t('rank')}</span>
            <span className="col-photo">{t('photo')}</span>
            <span className="col-name">{t('nameContact')}</span>
            <span className="col-score">{t('squats')}</span>
            <span className="col-time">{t('timeDate')}</span>
            <span className="col-mode">{t('completion')}</span>
          </div>
          {results.map((r, idx) => (
            <div key={r.id} className={`table-row ${idx < 3 ? 'top-three' : ''}`}>
              <span className={`col-rank rank-badge ${getRankClass(idx)}`}>
                {getRankEmoji(idx)}
              </span>
              <span className="col-photo">
                {r.photo ? (
                  <img src={r.photo} alt={r.name} className="avatar" />
                ) : (
                  <div className="avatar-placeholder">👤</div>
                )}
              </span>
              <span className="col-name" style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{r.name}</span>
                {r.phone ? (
                  <div className="phone-reveal-row">
                    {revealedPhones[r.id] ? (
                      <span className="secondary-cell-text">{r.phone}</span>
                    ) : (
                      <span className="secondary-cell-text">{t('phoneHidden')}</span>
                    )}
                    <button
                      type="button"
                      className="phone-toggle-btn"
                      onClick={() => togglePhoneReveal(r.id)}
                    >
                      {revealedPhones[r.id] ? t('hide') : t('show')}
                    </button>
                  </div>
                ) : (
                  <span className="secondary-cell-text">{t('phoneNotProvided')}</span>
                )}
              </span>
              <span className="col-score score-number">{r.score}</span>
              <span className="col-time" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>{formatTime(r.elapsed)}</span>
                <span className="secondary-cell-text">{formatAstanaDateTime(r)}</span>
              </span>
              <span className="col-mode mode-tag">
                {getFinishText(r)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
