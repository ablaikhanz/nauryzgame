import { useState, useEffect } from 'react';
import { getAllResults, getResultsByDate, getUniqueDates } from '../utils/db';

const Leaderboard = ({ onNewParticipant }) => {
  const [results, setResults] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h2 className="leaderboard-title">🏆 Лидерборд</h2>
        <div className="leaderboard-actions">
          <button onClick={handlePrint} className="btn-action" title="Печать / Сохранить PDF">
            🖨️ Печать / PDF
          </button>
          <button onClick={onNewParticipant} className="btn-action btn-action-primary">
            ➕ Новый участник
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="date-filter">
        <button
          className={`date-btn ${selectedDate === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedDate('all')}
        >
          Все дни
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
        <div className="loading-text">Загрузка...</div>
      ) : results.length === 0 ? (
        <p className="empty-text">Пока нет результатов. Стань первым!</p>
      ) : (
        <div className="results-table" id="printable-leaderboard">
          <div className="print-header">
            <h1>Қошқар Көтеру — Наурыз мейрамы 🐏</h1>
            <p>Лидерборд {selectedDate !== 'all' ? `за ${formatDate(selectedDate)}` : '— Все дни'}</p>
          </div>
          <div className="table-header">
            <span className="col-rank">Место</span>
            <span className="col-photo">Фото</span>
            <span className="col-name">Имя</span>
            <span className="col-score">Приседания</span>
            <span className="col-time">Время</span>
            <span className="col-mode">Режим</span>
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
                {r.comment && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    💬 {r.comment}
                  </span>
                )}
              </span>
              <span className="col-score score-number">{r.score}</span>
              <span className="col-time">{formatTime(r.elapsed)}</span>
              <span className="col-mode mode-tag">
                {r.mode === 'timed' ? `⏱️ ${r.timeLimit}с` : '♾️'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
