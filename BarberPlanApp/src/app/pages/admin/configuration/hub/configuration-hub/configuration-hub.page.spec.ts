import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfigurationHubPage } from './configuration-hub.page';

describe('ConfigurationHubPage', () => {
  let component: ConfigurationHubPage;
  let fixture: ComponentFixture<ConfigurationHubPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigurationHubPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
