import React from 'react';
import './AnnotationSidebar.css';

export default function AnnotationSidebar({ annotation, onClose }) {
  // annotation 객체가 있으면 'visible', 없으면 '' 클래스를 부여하여 애니메이션 제어
  const isVisible = !!annotation;

  return (
    <div className={`sidebar-panel ${isVisible ? 'visible' : ''}`}>
      <button className="close-button" onClick={onClose}>×</button>
      <div className="sidebar-content">
        {annotation ? (
          <>
            <h2>{annotation.name || '정보 없음'}</h2>
            <dl className="details-list">
              {Object.entries(annotation)
                .filter(([key, value]) => 
                  key !== 'name' && key !== 'category' && key !== 'position' &&
                  value !== null && String(value).trim() !== ''
                )
                .map(([key, value]) => (
                  <div key={key} className="detail-item">
                    <dt>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))
              }
            </dl>
          </>
        ) : (
          <h2>선택된 지점 없음</h2>
        )}
      </div>
    </div>
  );
}