import { Pipe, PipeTransform } from '@angular/core';
import { formatPhoneForDisplay } from './phone.util';

@Pipe({
  name: 'phoneDisplay',
  standalone: true
})
export class PhoneDisplayPipe implements PipeTransform {

  transform(value: string | null | undefined): string {

    if (!value) return '';
    return formatPhoneForDisplay(value);
  }
}
