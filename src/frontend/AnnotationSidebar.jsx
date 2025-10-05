import React, { useState, useEffect } from 'react';
import './AnnotationSidebar.css';

export default function AnnotationSidebar({ annotation, isEditing, onClose, onSave }) {
  const [editableAnnotation, setEditableAnnotation] = useState(null);

  useEffect(() => {
    // props로 받은 annotation이 변경될 때마다 내부 상태 업데이트
    if (annotation) {
      setEditableAnnotation({ ...annotation });
    } else {
      setEditableAnnotation(null);
    }
  }, [annotation]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // 숫자 필드는 숫자로 변환
    const newValue = (name === 'lat' || name === 'lon') ? parseFloat(value) : value;
    setEditableAnnotation(prev => ({ ...prev, [name]: newValue }));
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editableAnnotation);
    }
  };

  const isVisible = !!annotation;

  return (
    <div className={`sidebar-panel ${isVisible ? 'visible' : ''}`}>
      <button className="close-button" onClick={onClose}>×</button>
      <div className="sidebar-content">
        {editableAnnotation ? (
          isEditing ? (
            // --- 편집/생성 모드 ---
            <div className="form-container">
              <h2>{editableAnnotation.id.startsWith('new-') ? 'Add New Point' : 'Edit Point'}</h2>
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input type="text" id="name" name="name" value={editableAnnotation.name || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" rows="4" value={editableAnnotation.description || ''} onChange={handleChange}></textarea>
              </div>
              <div className="form-group">
                <label htmlFor="lat">Latitude</label>
                <input type="number" step="any" id="lat" name="lat" value={editableAnnotation.lat || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="lon">Longitude</label>
                <input type="number" step="any" id="lon" name="lon" value={editableAnnotation.lon || ''} onChange={handleChange} />
              </div>
              <button className="save-button" onClick={handleSave}>Save</button>
            </div>
          ) : (
            // --- 정보 표시 모드 ---
            <>
              <h2>{editableAnnotation.name || '정보 없음'}</h2>
              <dl className="details-list">
                {Object.entries(editableAnnotation)
                  .filter(([key]) => !['name', 'category', 'position', 'id'].includes(key) && editableAnnotation[key])
                  .map(([key, value]) => (
                    <div key={key} className="detail-item">
                      <dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))
                }
              </dl>
            </>
          )
        ) : (
          <h2>선택된 지점 없음</h2>
        )}
      </div>
    </div>
  );
}