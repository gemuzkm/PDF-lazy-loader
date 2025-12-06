/**
 * PDF Lazy Loader - Main JavaScript
 * Основной JavaScript код плагина
 * 
 * Этот файл содержит всю логику загрузки PDF
 * Совместим с Redis Object Cache и FlyingPress
 */

(function() {
    'use strict';

    /**
     * PDF Lazy Loader - главный класс
     */
    class PDFLazyLoader {
        constructor(options = {}) {
            this.options = {
                buttonColor: options.buttonColor || '#FF6B6B',
                buttonColorHover: options.buttonColorHover || '#E63946',
                loadingTime: options.loadingTime || 1500,
                debugMode: options.debugMode || false,
                ...options
            };

            this.pdfContainers = [];
            this.loadedPDFs = new Map();
            this.init();
        }

        /**
         * Инициализация
         */
        init() {
            this.log('PDF Lazy Loader initialized');

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupPDFs());
            } else {
                this.setupPDFs();
            }

            this.observeMutations();
            this.dispatchReady();
        }

        /**
         * Отправить событие готовности
         */
        dispatchReady() {
            const event = new CustomEvent('pdfLazyLoaderReady', {
                detail: { loader: this }
            });
            document.dispatchEvent(event);
        }

        /**
         * Наблюдение за изменениями DOM (для AJAX)
         */
        observeMutations() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                                const pdfs = node.querySelectorAll('[data-pdfemb-lazy]');
                                pdfs.forEach((pdf) => this.processPDF(pdf));

                                // Проверяем контейнеры PDF Embedder
                                const containers = node.querySelectorAll('[class*="wppdfemb-frame-container"]');
                                containers.forEach((container) => this.processPDFContainer(container));
                            }
                        });
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }

        /**
         * Основная функция: обработка всех PDF контейнеров
         */
        setupPDFs() {
            // Метод 1: Поиск по классу контейнера (PDF Embedder Premium)
            const pdfFrameContainers = document.querySelectorAll('[class*="wppdfemb-frame-container"]');
            pdfFrameContainers.forEach((container) => this.processPDFContainer(container));

            // Метод 2: Поиск по data-атрибутам
            const dataPDFs = document.querySelectorAll('[data-pdfemb-lazy="true"]');
            dataPDFs.forEach((pdf) => this.processPDF(pdf));

            // Метод 3: Поиск PDF iframe по src
            const iframes = document.querySelectorAll('iframe[src*="pdfemb-data"]');
            iframes.forEach((iframe) => this.wrapIframe(iframe));

            this.log(`Found ${this.pdfContainers.length} PDF(s)`);
        }

        /**
         * Обработка контейнера PDF
         */
        processPDFContainer(container) {
            const iframe = container.querySelector('iframe.pdfembed-iframe');
            if (!iframe) return;
            this.wrapIframe(iframe);
        }

        /**
         * Обработка отдельного PDF
         */
        processPDF(element) {
            if (element.tagName === 'IFRAME') {
                this.wrapIframe(element);
            }
        }

        /**
         * Заборачиваем iframe в Facade
         */
        wrapIframe(iframe) {
            if (iframe.closest('.pdf-facade-wrapper')) {
                return;
            }

            const pdfUrl = this.extractPDFUrl(iframe.src);
            if (!pdfUrl) return;

            const wrapper = this.createFacade(iframe, pdfUrl);
            iframe.parentNode.insertBefore(wrapper, iframe);
            iframe.style.display = 'none';
            iframe.classList.add('pdf-lazy-loading-iframe');

            wrapper.dataset.iframeId = this.generateUID();
            this.pdfContainers.push({
                id: wrapper.dataset.iframeId,
                wrapper: wrapper,
                iframe: iframe,
                pdfUrl: pdfUrl,
                isLoaded: false,
            });
        }

        /**
         * Создание Facade элемента
         */
        createFacade(iframe, pdfUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper';

            const width = iframe.style.width || '100%';
            const height = iframe.style.height || '600px';
            const maxWidth = iframe.style.maxWidth || '100%';

            wrapper.innerHTML = `
                <div class="pdf-facade-container" style="
                    width: 100%;
                    max-width: ${maxWidth};
                    height: ${height};
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background: #f5f5f5;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">
                    <div class="pdf-facade-background" style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
                        z-index: 0;
                    "></div>

                    <div class="pdf-facade-content" style="
                        position: relative;
                        z-index: 1;
                        text-align: center;
                        padding: 40px 20px;
                    ">
                        <div class="pdf-facade-icon" style="margin-bottom: 20px;">
                            <svg width="64" height="80" viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="4" width="56" height="72" rx="2" fill="${this.options.buttonColor}" stroke="#C92A2A" stroke-width="2"/>
                                <text x="32" y="48" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PDF</text>
                            </svg>
                        </div>

                        <h3 class="pdf-facade-title" style="
                            margin: 0 0 10px 0;
                            color: #333;
                            font-size: 18px;
                            font-weight: 600;
                        ">PDF Документ</h3>

                        <p class="pdf-facade-subtitle" style="
                            margin: 0 0 20px 0;
                            color: #666;
                            font-size: 14px;
                        ">Нажмите кнопку ниже для загрузки</p>

                        <div class="pdf-loading-indicator" style="
                            display: none;
                            margin-bottom: 20px;
                        ">
                            <div class="pdf-spinner" style="
                                width: 30px;
                                height: 30px;
                                border: 3px solid #f3f3f3;
                                border-top: 3px solid ${this.options.buttonColor};
                                border-radius: 50%;
                                animation: spin 1s linear infinite;
                                margin: 0 auto;
                            "></div>
                            <p class="pdf-loading-text" style="
                                margin: 10px 0 0 0;
                                color: #666;
                                font-size: 12px;
                            ">Загрузка PDF...</p>
                        </div>

                        <div class="pdf-facade-buttons" style="
                            display: flex;
                            gap: 10px;
                            justify-content: center;
                            flex-wrap: wrap;
                        ">
                            <button class="pdf-view-button" type="button" style="
                                padding: 12px 24px;
                                background: ${this.options.buttonColor};
                                color: white;
                                border: none;
                                border-radius: 4px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                📖 Просмотреть PDF
                            </button>
                            <button class="pdf-download-button" type="button" style="
                                padding: 12px 24px;
                                background: white;
                                color: #333;
                                border: 1px solid #ddd;
                                border-radius: 4px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                ⬇ Скачать
                            </button>
                        </div>

                        <p class="pdf-facade-info" style="
                            margin: 20px 0 0 0;
                            color: #999;
                            font-size: 12px;
                        ">Файл будет загружен при первом обращении</p>
                    </div>
                </div>
            `;

            this.addSpinnerAnimation();

            const viewBtn = wrapper.querySelector('.pdf-view-button');
            const dlBtn = wrapper.querySelector('.pdf-download-button');

            viewBtn.addEventListener('click', () => this.loadPDF(wrapper.dataset.iframeId, 'view'));
            dlBtn.addEventListener('click', () => this.downloadPDF(pdfUrl));

            viewBtn.addEventListener('mouseenter', (e) => {
                e.target.style.background = this.options.buttonColorHover;
                e.target.style.transform = 'translateY(-2px)';
            });
            viewBtn.addEventListener('mouseleave', (e) => {
                e.target.style.background = this.options.buttonColor;
                e.target.style.transform = 'translateY(0)';
            });

            dlBtn.addEventListener('mouseenter', (e) => {
                e.target.style.borderColor = this.options.buttonColor;
                e.target.style.color = this.options.buttonColor;
            });
            dlBtn.addEventListener('mouseleave', (e) => {
                e.target.style.borderColor = '#ddd';
                e.target.style.color = '#333';
            });

            return wrapper;
        }

        /**
         * Загрузка PDF при клике
         */
        loadPDF(wrapperId, mode = 'view') {
            const pdfEntry = this.pdfContainers.find((p) => p.id === wrapperId);
            if (!pdfEntry) return;

            if (pdfEntry.isLoaded) {
                this.showPDF(pdfEntry);
                return;
            }

            const wrapper = pdfEntry.wrapper;
            const buttons = wrapper.querySelector('.pdf-facade-buttons');
            const loadingIndicator = wrapper.querySelector('.pdf-loading-indicator');

            buttons.style.display = 'none';
            loadingIndicator.style.display = 'block';

            setTimeout(() => {
                pdfEntry.isLoaded = true;
                this.showPDF(pdfEntry);
            }, this.options.loadingTime);
        }

        /**
         * Отображение загруженного PDF
         */
        showPDF(pdfEntry) {
            const wrapper = pdfEntry.wrapper;
            const iframe = pdfEntry.iframe;

            wrapper.style.display = 'none';
            iframe.style.display = 'block';

            if (window.PDFEmbedderAutoResize) {
                window.PDFEmbedderAutoResize(iframe);
            } else {
                iframe.style.width = '100%';
                iframe.style.height = iframe.dataset.height || '600px';
            }

            window.dispatchEvent(
                new CustomEvent('pdfembedder:loaded', {
                    detail: { iframe: iframe, pdfEntry: pdfEntry },
                })
            );

            setTimeout(() => {
                iframe.dispatchEvent(new Event('resize'));
            }, 100);
        }

        /**
         * Загрузка PDF файла (скачивание)
         */
        downloadPDF(pdfUrl) {
            if (!pdfUrl) return;
            const realUrl = this.decodeBase64PDF(pdfUrl);
            const link = document.createElement('a');
            link.href = realUrl;
            link.download = 'document.pdf';
            link.click();
        }

        /**
         * Извлечение URL PDF из iframe src
         */
        extractPDFUrl(iframeSrc) {
            if (!iframeSrc) return null;
            try {
                const url = new URL(iframeSrc, window.location.origin);
                const pdfembData = url.searchParams.get('pdfemb-data');
                if (!pdfembData) return null;
                try {
                    const urlSafeBase64 = pdfembData.replace(/-/g, '+').replace(/_/g, '/');
                    const padded = urlSafeBase64 + '=='.slice(0, (4 - urlSafeBase64.length % 4) % 4);
                    const jsonStr = atob(padded);
                    const data = JSON.parse(jsonStr);
                    return data.url || null;
                } catch (e) {
                    this.log('Error decoding PDF data: ' + e.message);
                    return null;
                }
            } catch (e) {
                this.log('Error parsing URL: ' + e.message);
                return null;
            }
        }

        /**
         * Декодирование base64 PDF URL
         */
        decodeBase64PDF(encoded) {
            try {
                const urlSafeBase64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
                const padded = urlSafeBase64 + '=='.slice(0, (4 - urlSafeBase64.length % 4) % 4);
                const jsonStr = atob(padded);
                const data = JSON.parse(jsonStr);
                return data.url || encoded;
            } catch (e) {
                return encoded;
            }
        }

        /**
         * Добавление CSS для спинера загрузки
         */
        addSpinnerAnimation() {
            if (document.getElementById('pdf-lazy-loader-styles')) return;

            const style = document.createElement('style');
            style.id = 'pdf-lazy-loader-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .pdf-facade-wrapper {
                    width: 100%;
                    margin-bottom: 0;
                }

                .pdf-facade-container {
                    transition: all 0.3s ease;
                }

                .pdf-facade-buttons button {
                    font-family: inherit;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .pdf-facade-buttons button:active {
                    transform: scale(0.98);
                }

                @media (prefers-color-scheme: dark) {
                    .pdf-facade-container {
                        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                        border-color: #444;
                    }
                    .pdf-facade-title {
                        color: #fff !important;
                    }
                    .pdf-facade-subtitle, .pdf-loading-text, .pdf-facade-info {
                        color: #bbb !important;
                    }
                    .pdf-download-button {
                        background: #333 !important;
                        color: #fff !important;
                        border-color: #555 !important;
                    }
                }

                @media (max-width: 600px) {
                    .pdf-facade-content {
                        padding: 20px 15px !important;
                    }
                    .pdf-facade-icon svg {
                        width: 48px !important;
                        height: 60px !important;
                    }
                    .pdf-facade-title {
                        font-size: 16px !important;
                    }
                    .pdf-facade-buttons {
                        flex-direction: column !important;
                    }
                    .pdf-facade-buttons button {
                        width: 100%;
                    }
                }
            `;

            document.head.appendChild(style);
        }

        /**
         * Генератор уникальных ID
         */
        generateUID() {
            return 'pdf-' + Math.random().toString(36).substr(2, 9);
        }

        /**
         * Логирование
         */
        log(message) {
            if (this.options.debugMode) {
                console.log('[PDFLazyLoader] ' + message);
            }
        }
    }

    // Инициализация
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new PDFLazyLoader(typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {});
        });
    } else {
        new PDFLazyLoader(typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {});
    }

    // Экспорт для использования
    window.PDFLazyLoader = PDFLazyLoader;
})();
