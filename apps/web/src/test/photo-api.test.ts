import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoApiError, uploadPhoto } from '../api/photos.js';

class FakeXmlHttpRequest extends EventTarget {
  static latest: FakeXmlHttpRequest;
  readonly upload = new EventTarget();
  withCredentials = false;
  status = 202;
  responseText = JSON.stringify({
    uploadId: '10000000-0000-4000-8000-000000000001',
    photoId: '20000000-0000-4000-8000-000000000002',
    status: 'processing',
  });
  method = '';
  url = '';
  body: Document | XMLHttpRequestBodyInit | null | undefined;

  constructor() {
    super();
    FakeXmlHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  abort() {
    this.dispatchEvent(new Event('abort'));
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('photo upload api', () => {
  it('sends credentialed multipart data and reports byte progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    const onProgress = vi.fn();
    const promise = uploadPhoto(new File(['image'], 'memory.jpg'), { onProgress });
    const request = FakeXmlHttpRequest.latest;

    request.upload.dispatchEvent(new ProgressEvent('progress', {
      lengthComputable: true,
      loaded: 5,
      total: 10,
    }));
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/photos/uploads?allowDuplicate=false');
    expect(request.withCredentials).toBe(true);
    expect(request.body).toBeInstanceOf(FormData);
    expect(onProgress).toHaveBeenCalledWith(50);

    request.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toMatchObject({ status: 'processing' });
  });

  it('exposes the stable API error code for duplicate decisions', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    const promise = uploadPhoto(new File(['image'], 'memory.jpg'));
    const request = FakeXmlHttpRequest.latest;
    request.status = 409;
    request.responseText = JSON.stringify({ error: 'DUPLICATE_PHOTO' });
    request.dispatchEvent(new Event('load'));

    await expect(promise).rejects.toEqual(expect.objectContaining<Partial<PhotoApiError>>({
      code: 'DUPLICATE_PHOTO',
      status: 409,
    }));
  });
});
