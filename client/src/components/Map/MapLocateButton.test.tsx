import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MapLocateButton from './MapLocateButton';
let success: PositionCallback, failure: PositionErrorCallback;
let request: ReturnType<typeof vi.fn>;
beforeEach(()=>{
 request=vi.fn((ok,fail)=>{success=ok;failure=fail;});
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:request}});
});
afterEach(()=>vi.unstubAllGlobals());
const fix = {coords:{latitude:30.5,longitude:104.1,accuracy:20,heading:null,speed:null},timestamp:1} as GeolocationPosition;
it('requests only on click, shows loading, prevents duplicate requests and accepts a fix', async()=>{
 const onPosition=vi.fn();render(<MapLocateButton onPosition={onPosition} />);
 expect(request).not.toHaveBeenCalled();
 const button=screen.getByRole('button');fireEvent.click(button);
 expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-busy','true');expect(screen.getByRole('status')).toBeInTheDocument();
 fireEvent.click(button);expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0][2]).toMatchObject({enableHighAccuracy:true,timeout:15000});
 await act(async()=>success(fix));
 expect(onPosition).toHaveBeenCalledWith(expect.objectContaining({lat:30.5,lng:104.1,accuracy:20}));
 expect(button).not.toBeDisabled();
});
it.each([[1,'locationPermissionDenied'],[2,'locationUnavailable'],[3,'locationTimeout']])('handles browser error %s and permits retry',async(code,key)=>{
 const onPosition=vi.fn();render(<MapLocateButton onPosition={onPosition} />);
 fireEvent.click(screen.getByRole('button'));
 await act(async()=>failure({code,PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3,message:'raw browser message'} as GeolocationPositionError));
 expect(screen.getByRole('alert')).toHaveTextContent(`journey.editor.${key}`);expect(onPosition).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button'));expect(request).toHaveBeenCalledTimes(2);
 await act(async()=>success(fix));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('handles an unsupported browser without requesting location',async()=>{
 vi.stubGlobal('navigator',{});render(<MapLocateButton onPosition={vi.fn()} />);
 fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('journey.editor.locationUnavailable'));
});
it('ignores a late fix after the map unmounts',async()=>{
 const onPosition=vi.fn();const {unmount}=render(<MapLocateButton onPosition={onPosition} />);
 fireEvent.click(screen.getByRole('button'));unmount();await act(async()=>success(fix));expect(onPosition).not.toHaveBeenCalled();
});
